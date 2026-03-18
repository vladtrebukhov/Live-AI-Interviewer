import { expect, test } from '@playwright/test';

test('initial user flow: home to dashboard to interview page', async ({ page }) => {
  const questions = [
    {
      id: 'q-1',
      title: 'Design a Parking Lot',
      description: 'Design a parking lot with multiple spot types and parking rules.',
      difficulty: 'medium',
      tags: ['OOP', 'Design'],
      starterCodes: [
        { language: 'typescript', code: 'class ParkingLot {}' },
        { language: 'javascript', code: 'class ParkingLot {}' },
      ],
      testCases: [
        {
          id: 'tc-1',
          input: 'park car in empty lot',
          expectedOutput: 'true',
          isHidden: false,
        },
      ],
    },
  ];

  await page.route('**/api/questions/q-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(questions[0]),
    });
  });

  await page.route('**/api/questions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(questions),
    });
  });

  await page.goto('/');

  const getStartedCta = page.getByRole('link', { name: 'Get Started' });
  await expect(getStartedCta).toBeVisible();

  await getStartedCta.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Select a Question' })).toBeVisible();

  const firstQuestionTitle = page.getByRole('heading', { name: 'Design a Parking Lot' });
  await expect(firstQuestionTitle).toBeVisible();
  await firstQuestionTitle.click();

  await expect(page).toHaveURL(/\/interview\/q-1$/);
  await expect(page.getByRole('heading', { name: 'Design a Parking Lot' })).toBeVisible();
  await expect(page.getByText('Problem Description')).toBeVisible();
  await expect(page.getByLabel('Language:')).toBeVisible();
});