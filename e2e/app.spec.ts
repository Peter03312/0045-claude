import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

test.describe('修补次序台', () => {
  test('内置样例求解并逐步复演', async ({ page }) => {
    await page.goto('/');

    // 样例一已预载，直接求解
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution-summary')).toContainText('条带数 2');
    await expect(page.getByTestId('solution-summary')).toContainText('总长度 8');
    await expect(page.getByTestId('solution-sequence')).toHaveText('w-long → y-span');

    // 复演：第 0 步只有 A 锚定，w-long 可贴，ch-back 开放
    await expect(page.getByTestId('step-indicator')).toHaveText('第 0 / 2 步');
    await expect(page.getByTestId('anchored-list')).toHaveText('A');
    await expect(page.getByTestId('applicable-list')).toContainText('w-long');
    await expect(page.getByTestId('fragment-node-A')).toHaveAttribute('data-anchored', 'true');
    await expect(page.getByTestId('fragment-node-C')).toHaveAttribute('data-anchored', 'false');
    await expect(page.getByTestId('channel-list')).toContainText('ch-back：开放');

    // 第 1 步：贴上 w-long，B 锚定，y-span 变为可贴
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('step-indicator')).toHaveText('第 1 / 2 步');
    await expect(page.getByTestId('step-action')).toContainText('w-long');
    await expect(page.getByTestId('anchored-list')).toContainText('B');
    await expect(page.getByTestId('applicable-list')).toContainText('y-span');
    await expect(page.getByTestId('strip-node-w-long')).toHaveAttribute('data-state', 'applied');

    // 第 2 步：全部锚定，ch-back 始终未封闭
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('step-indicator')).toHaveText('第 2 / 2 步');
    await expect(page.getByTestId('anchored-list')).toContainText('C');
    await expect(page.getByTestId('channel-list')).toContainText('ch-back：开放');
    await expect(page.getByTestId('step-next')).toBeDisabled();

    // 回退复演
    await page.getByTestId('step-prev').click();
    await expect(page.getByTestId('step-indicator')).toHaveText('第 1 / 2 步');
  });

  test('导入 JSON 文件后求解', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('import-input').setInputFiles(fixture('import-sample.json'));
    await expect(page.getByTestId('editor')).toHaveValue(/imported-strip/);
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution-sequence')).toHaveText('imported-strip');
    await expect(page.getByTestId('solution-summary')).toContainText('总长度 2.5');
  });

  test('修改内容后旧结果立即失效', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution')).toBeVisible();

    // 任意编辑：旧解被清除
    await page.getByTestId('editor').fill(' ');
    await expect(page.getByTestId('solution')).toHaveCount(0);
    await expect(page.getByTestId('no-result')).toBeVisible();
  });

  test('格式化改动内容后旧结果同样失效', async ({ page }) => {
    await page.goto('/');
    // 填入合法但紧凑的 JSON，求解后再格式化（内容发生变化）
    const pretty = await page.getByTestId('editor').inputValue();
    const compact = JSON.stringify(JSON.parse(pretty));
    await page.getByTestId('editor').fill(compact);
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution')).toBeVisible();

    await page.getByRole('button', { name: '格式化' }).click();
    await expect(page.getByTestId('editor')).toHaveValue(pretty);
    await expect(page.getByTestId('solution')).toHaveCount(0);
    await expect(page.getByTestId('no-result')).toBeVisible();
  });

  test('结构错误定位对象并清除旧解', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution')).toBeVisible();

    const broken = JSON.stringify(
      {
        fragments: ['A'],
        initialAnchored: ['A'],
        strips: [
          {
            id: 'bad',
            fragments: ['A', 'GHOST'],
            face: 'front',
            requiresChannels: [],
            closesChannels: [],
            prerequisites: [],
            length: -1,
            disabled: false,
          },
        ],
      },
      null,
      2,
    );
    await page.getByTestId('editor').fill(broken);

    // 错误列表定位到具体对象路径，旧解被清除，求解按钮禁用
    await expect(page.getByTestId('error-list')).toContainText('strips[0].fragments[1]');
    await expect(page.getByTestId('error-list')).toContainText('strips[0].length');
    await expect(page.getByTestId('solution')).toHaveCount(0);
    await expect(page.getByTestId('solve-button')).toBeDisabled();
  });

  test('接近的小数长度不丢精度，超大总长度不显示无穷大', async ({ page }) => {
    await page.goto('/');
    // 两个长度相差 1e-17：double 无法区分，字面量保留后 b-short 实际更短
    const close = `{
      "fragments": ["A", "B"],
      "initialAnchored": ["A"],
      "strips": [
        { "id": "a-long", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1.00000000000000002, "disabled": false },
        { "id": "b-short", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1.00000000000000001, "disabled": false }
      ]
    }`;
    await page.getByTestId('editor').fill(close);
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution-sequence')).toHaveText('b-short');
    await expect(page.getByTestId('solution-summary')).toContainText(
      '总长度 1.00000000000000001',
    );

    // 格式化往返不丢字面量精度
    await page.getByRole('button', { name: '格式化' }).click();
    await expect(page.getByTestId('editor')).toHaveValue(/1\.00000000000000001/);

    // 两条 1e308：总和 2e308 超出 double 上限，应显示精确值而非 Infinity
    const huge = `{
      "fragments": ["A", "B", "C"],
      "initialAnchored": ["A"],
      "strips": [
        { "id": "h1", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1e308, "disabled": false },
        { "id": "h2", "fragments": ["B", "C"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1e308, "disabled": false }
      ]
    }`;
    await page.getByTestId('editor').fill(huge);
    await page.getByTestId('solve-button').click();
    await expect(page.getByTestId('solution-summary')).toContainText(
      `总长度 2${'0'.repeat(308)}`,
    );
    await expect(page.getByTestId('solution-summary')).not.toContainText('Infinity');
  });

  test('无解样例展示最早阻断与约束解释，不返回部分方案', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '载入样例：无解' }).click();
    await page.getByTestId('solve-button').click();

    await expect(page.getByTestId('failure')).toBeVisible();
    await expect(page.getByTestId('solution')).toHaveCount(0);
    const earliest = page.getByTestId('earliest-block');
    await expect(earliest).toContainText('最早阻断');
    await expect(earliest).toContainText('x-short');
    await expect(page.getByTestId('failure')).toContainText('所需通道「ch-back」已封闭');
    await expect(page.getByTestId('failure')).toContainText('条带已禁用');
  });
});
