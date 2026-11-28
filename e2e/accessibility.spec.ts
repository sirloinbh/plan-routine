import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// #353: every main screen is scanned with axe at the phone and the PC size of the project rule
// (.claude/rules/frontend.md), and serious or critical violations fail the run.
//
// To cover a new screen, append one entry to `screens`: its path and the name of its level-1 heading.
// Plans (#338) is not listed yet; its issues add their own entries. A single Mandalart page needs saved data, so only
// the list is scanned here.
const screens = [
  { path: '/today', heading: 'Today' },
  { path: '/weekly', heading: 'Weekly routines' },
  { path: '/twelve-week', heading: '12-week routines' },
  { path: '/mandalarts', heading: 'Mandalart' },
  { path: '/diary', heading: 'Diary' },
  { path: '/routines', heading: 'Daily routines' },
  { path: '/four-week', heading: '4-week routines' },
  { path: '/records', heading: 'Records' },
  { path: '/review', heading: 'Weekly review' },
  { path: '/stats', heading: 'Completion rates' },
  { path: '/settings', heading: 'Settings' },
];

const sizes = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'pc', width: 1440, height: 900 },
];

for (const size of sizes) {
  for (const screen of screens) {
    test(`${screen.path} has no serious accessibility problem at ${size.name} size`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(screen.path);
      await expect(
        page.getByRole('heading', { level: 1, name: screen.heading, exact: true }),
      ).toBeVisible();
      await page.waitForLoadState('networkidle');

      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      // The rule id and the first elements, so a failure says what to fix.
      expect(
        blocking.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
        })),
      ).toEqual([]);
    });
  }
}
