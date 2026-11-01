"""scripts/theme_pick.py: the theme follows the film's genre and tone; light by default; a brand takes the hand only."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / 'scripts'))
import theme_pick  # noqa: E402

TEMPLATE = (SKILL / 'templates' / 'brief.md').read_text(encoding='utf-8')


def brief(**rows):
    """The real template with some rows answered (first-cell prefix → value)."""
    out = []
    for line in TEMPLATE.splitlines():
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        for k, v in rows.items():
            if len(c) >= 3 and c[0].startswith(k):
                line = f'| {c[0]} | {v} | {c[2]} |'
        out.append(line)
    return '\n'.join(out)


class PickTest(unittest.TestCase):
    def name(self, b, script=''):
        return theme_pick.pick(b, script)[0]

    def test_genres(self):
        cases = {
            'school': brief(**{'Тема': 'Урок физики: почему корабль не тонет', 'Аудитория': 'школьники, курс'}),
            'card': brief(**{'Тема': 'Поздравление с днём рождения маме'}),
            'draft': brief(**{'Тема': 'Как работает архитектура нашего сервера'}),
            'graphite': brief(**{'Тема': 'Квартальная выручка и прибыль, отчётность', 'Аудитория': 'инвесторы'}),
            'riso': brief(**{'Тема': 'Анонс фестиваля и вечеринки в клубе'}),
            'yard': brief(**{'Тема': 'Турнир по стритболу во дворе'}),
            'notebook': brief(**{'Тема': 'Исследование оттока: выводы опроса', 'Одна идея': 'отток решается на третьей неделе'}),
            'studio': brief(**{'Тема': 'Запуск продукта: новая функция приложения'}),
        }
        for want, b in cases.items():
            with self.subTest(want=want):
                self.assertEqual(self.name(b), want)

    def test_light_by_default_dark_on_request(self):
        b = brief(**{'Тема': 'Как работает архитектура и инженерия сервера'})
        self.assertEqual(self.name(b), 'draft')                 # blueprint is the dark twin: only when asked
        self.assertEqual(self.name(b + '\nХочется тёмный, как кино.'), 'blueprint')
        tie = brief(**{'Тема': 'Расследование утечки и взлома: исследование данных'})   # newsroom 3 words × 0.6 < notebook 2
        self.assertEqual(self.name(tie), 'notebook')
        self.assertEqual(self.name(tie + '\nНочной тёмный кадр.'), 'newsroom')

    def test_vertical_pushes_feed(self):
        b = brief(**{'Тема': 'Три ошибки новичка в продажах, советы', 'Форматы': '9x16'})
        self.assertEqual(self.name(b), 'feed')

    def test_template_labels_do_not_count(self):
        # the empty template mentions «лента», «продукт», «стиль» in its own columns: nothing is answered → fallback
        self.assertEqual(self.name(TEMPLATE), 'notebook')
        self.assertEqual(self.name(brief(**{'Тема': 'Наша команда'})), 'notebook')

    def test_named_theme_wins(self):
        b = brief(**{'Тема': 'Квартальная выручка', 'Стиль': 'тема yard, громко'})
        self.assertEqual(self.name(b), 'yard')

    def test_script_counts_when_brief_is_thin(self):
        self.assertEqual(self.name(brief(**{'Тема': 'Наша история'}), 'Сегодня урок. Объясняю задачу для детей.'), 'school')

    def test_cli_writes_timeline_and_brief_and_brand_hand_only(self):
        with tempfile.TemporaryDirectory(prefix='motion-theme-') as d:
            p = Path(d)
            (p / 'timeline.json').write_text(json.dumps({'bpm': 120, 'duration': 10}), encoding='utf-8')
            (p / 'brief.md').write_text(brief(**{'Тема': 'Поздравление с юбилеем', 'Цвета бренда': '#123456'}), encoding='utf-8')
            r = subprocess.run([sys.executable, str(SKILL / 'scripts/theme_pick.py'), '--no-fonts'], cwd=d, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            th = json.loads((p / 'timeline.json').read_text(encoding='utf-8'))['theme']
            self.assertEqual((th['name'], th.get('only')), ('card', 'hand'))
            self.assertIn('| Тема сцены (THEMES) | `card` — только рукопись', (p / 'brief.md').read_text(encoding='utf-8'))
            # a second run rescored, not stuck on the theme it wrote into the brief itself
            (p / 'brief.md').write_text((p / 'brief.md').read_text(encoding='utf-8').replace('Поздравление с юбилеем', 'Урок физики для школы'), encoding='utf-8')
            subprocess.run([sys.executable, str(SKILL / 'scripts/theme_pick.py'), '--no-fonts'], cwd=d, check=True, capture_output=True)
            self.assertEqual(json.loads((p / 'timeline.json').read_text(encoding='utf-8'))['theme']['name'], 'school')

    def test_english_brief(self):
        en = (SKILL / 'publish/en/templates/brief.md').read_text(encoding='utf-8')
        self.assertEqual(theme_pick.pick(en)[0], 'notebook')
        b = en.replace('| Subject / product | ? |', '| Subject / product | A lesson for kids: why ships float |')
        name, why, _ = theme_pick.pick(b)
        self.assertEqual(name, 'school'); self.assertTrue(why.startswith('brief words'), why)
        self.assertEqual(theme_pick.pick(en.replace('| Formats | ? |', '| Formats | 9x16 |').replace('| Subject / product | ? |', '| Subject / product | tips: mistakes creators make |'))[0], 'feed')


if __name__ == '__main__':
    unittest.main()
