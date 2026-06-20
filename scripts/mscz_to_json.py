"""
mscz_to_json.py — MuseScore mscz 파일을 젤리피아노 JSON으로 변환

사용법:
    python scripts/mscz_to_json.py mscz/TheLoveofGod.mscz json/TheLoveofGod.json

주의:
    - fingering은 mscx 원본 데이터만 사용 (알고리즘 자동생성 절대 금지)
    - mscx는 MuseScore 고유 XML 형식 (MusicXML과 다름)

[수정 내역]
    - 마디 duration을 음표 합산이 아닌 박자표 기준으로 계산
      (len 속성 있으면 len 우선, 없으면 박자표 고정)
    - measure 번호를 0-based로 통일 (기존: 1-based 오류)
    - current_time을 마디 단위로 전진 (음표 단위 누적 오류 제거)
"""

import zipfile
import xml.etree.ElementTree as ET
import json
import sys
from fractions import Fraction


def tpc_to_note_name(tpc, pitch):
    """tpc(tonal pitch class) + MIDI pitch → 음이름 문자열 (예: 'Bb3', 'F#4')"""
    tpc_steps = ['C', 'G', 'D', 'A', 'E', 'B', 'F']
    step = tpc_steps[tpc % 7]
    alter = (tpc // 7) - 2
    octave = (pitch // 12) - 1

    if alter > 0:
        alter_str = '#' * alter
    elif alter < 0:
        alter_str = 'b' * (-alter)
    else:
        alter_str = ''

    return f"{step}{alter_str}{octave}"


def dur_type_to_fraction(dur_type):
    """durationType 문자열 → 4분음표 기준 박자 Fraction"""
    mapping = {
        'whole':   Fraction(4, 1),
        'half':    Fraction(2, 1),
        'quarter': Fraction(1, 1),
        'eighth':  Fraction(1, 2),
        '16th':    Fraction(1, 4),
        '32nd':    Fraction(1, 8),
        '64th':    Fraction(1, 16),
    }
    return mapping.get(dur_type)


def get_elem_beats(elem):
    """Chord 또는 Rest 요소의 박자(4분음표 기준 Fraction) 반환"""
    dur_type_el = elem.find('durationType')
    if dur_type_el is None:
        return Fraction(0)
    dur_type = dur_type_el.text

    base = dur_type_to_fraction(dur_type)
    if base is None:
        return Fraction(0)

    dots_el = elem.find('dots')
    if dots_el is not None and dots_el.text:
        try:
            num_dots = int(dots_el.text)
            extra = base
            for _ in range(num_dots):
                extra /= 2
                base += extra
        except ValueError:
            pass

    return base


def parse_mscz(mscz_path, json_path):
    # 1. mscz(ZIP)에서 mscx 추출
    with zipfile.ZipFile(mscz_path, 'r') as z:
        mscx_candidates = [n for n in z.namelist() if n.endswith('.mscx')]
        if not mscx_candidates:
            print("오류: mscz 내부에 .mscx 파일이 없습니다.")
            sys.exit(1)
        mscx_name = mscx_candidates[0]
        mscx_data = z.read(mscx_name)

    root = ET.fromstring(mscx_data)
    score = root.find('Score')

    # 2. 메타 정보
    title = ''
    composer = ''
    for tag in score.findall('metaTag'):
        name = tag.get('name')
        if name == 'movementTitle':
            title = tag.text or ''
        elif name == 'composer':
            composer = tag.text or ''

    # 3. Staff 순회
    staffs = [s for s in score.findall('Staff') if s.get('id')]

    bpm = 90.0
    time_sig_n = 4
    time_sig_d = 4
    all_notes = []

    for staff_el in staffs:
        staff_id = staff_el.get('id')
        hand = 'R' if staff_id == '1' else 'L'

        measure_start_time = 0.0  # 마디 시작 시간 (초)
        measure_number = 0        # 0-based

        for meas_el in staff_el.findall('Measure'):

            # ── 마디 길이 계산 (len 속성 우선, 없으면 박자표 고정) ──
            meas_len_attr = meas_el.get('len')
            if meas_len_attr:
                # len="3/8" → Fraction(3,8) → 4분음표 기준: 3/8 * 4 = 1.5박
                frac = Fraction(meas_len_attr)
                measure_beats = frac * 4
            else:
                # 박자표 기준 (예: 3/4 → 3박)
                measure_beats = Fraction(time_sig_n * 4, time_sig_d)

            beat_duration = 60.0 / bpm  # 4분음표 1박 = 초
            measure_duration = float(measure_beats) * beat_duration

            voice = meas_el.find('voice')
            if voice is not None:
                # ── 음표/쉼표 처리: 마디 내 상대 시간 누적 ──
                note_time = measure_start_time  # 음표별 절대 시간

                for elem in voice:
                    if elem.tag == 'Tempo':
                        tempo_el = elem.find('tempo')
                        if tempo_el is not None:
                            bpm = float(tempo_el.text) * 60
                            beat_duration = 60.0 / bpm
                            measure_duration = float(measure_beats) * beat_duration

                    elif elem.tag == 'TimeSig':
                        sig_n = elem.find('sigN')
                        sig_d = elem.find('sigD')
                        if sig_n is not None and sig_d is not None:
                            time_sig_n = int(sig_n.text)
                            time_sig_d = int(sig_d.text)
                            # 박자표 변경 시 measure_beats 재계산
                            if not meas_len_attr:
                                measure_beats = Fraction(time_sig_n * 4, time_sig_d)
                                measure_duration = float(measure_beats) * beat_duration

                    elif elem.tag in ('Chord', 'Rest'):
                        elem_beats = get_elem_beats(elem)
                        elem_duration = float(elem_beats) * beat_duration

                        if elem.tag == 'Chord':
                            for note_el in elem.findall('Note'):
                                pitch_el = note_el.find('pitch')
                                tpc_el = note_el.find('tpc')
                                if pitch_el is None or tpc_el is None:
                                    continue

                                pitch = int(pitch_el.text)
                                tpc = int(tpc_el.text)
                                note_name = tpc_to_note_name(tpc, pitch)

                                # Fingering (원본 데이터만 사용)
                                finger = 0
                                finger_el = note_el.find('Fingering')
                                if finger_el is not None:
                                    ft = finger_el.find('text')
                                    if ft is not None and ft.text:
                                        try:
                                            finger = int(ft.text.strip())
                                        except ValueError:
                                            finger = 0

                                all_notes.append({
                                    'time': round(note_time, 6),
                                    'note': note_name,
                                    'midi': pitch,
                                    'duration': round(elem_duration, 6),
                                    'hand': hand,
                                    'finger': finger,
                                    'measure': measure_number
                                })

                        # 시간 전진 (Chord든 Rest든)
                        note_time += elem_duration

            # ── 마디 시작 시간 전진 (음표 합산이 아닌 마디 길이 기준) ──
            measure_start_time += measure_duration
            measure_number += 1

    # 시간순 정렬
    all_notes.sort(key=lambda n: (n['time'], n['midi']))

    # JSON 출력
    result = {
        'title': title,
        'composer': composer,
        'bpm': round(bpm, 2),
        'timeSignature': f"{time_sig_n}/{time_sig_d}",
        'totalDuration': round(max(n['time'] + n['duration'] for n in all_notes), 4) if all_notes else 0,
        'notes': all_notes
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # 결과 출력
    print(f"변환 완료: {len(all_notes)}개 노트")
    print(f"  제목: {title}")
    print(f"  BPM: {round(bpm, 2)}")
    print(f"  박자: {time_sig_n}/{time_sig_d}")
    rh = sum(1 for n in all_notes if n['hand'] == 'R')
    lh = sum(1 for n in all_notes if n['hand'] == 'L')
    fing = sum(1 for n in all_notes if n['finger'] > 0)
    print(f"  오른손: {rh}, 왼손: {lh}")
    print(f"  fingering: {fing}/{len(all_notes)} ({fing/len(all_notes)*100:.0f}%)")
    print(f"  totalDuration: {result['totalDuration']}초")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("사용법: python mscz_to_json.py <입력.mscz> <출력.json>")
        sys.exit(1)
    parse_mscz(sys.argv[1], sys.argv[2])
