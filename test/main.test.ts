import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { getDesiredSessionVolume } from '../src/fetch/util';
import { MyStack } from '../src/main';
import { createSessionRequirementsList } from '../src/SessionRunner';

test('Snapshot', () => {
  const app = new App();
  const stack = new MyStack(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});

test('createSessionRequirementsList', () => {
  const sessionRequirementsList = createSessionRequirementsList({
    growthPattern: 'LINEAR',
    graph: [
      { pointInSeconds: 0, sessionVolume: 10 },
      { pointInSeconds: 60, sessionVolume: 15 },
      { pointInSeconds: 120, sessionVolume: 20 },
    ],
  }, 3);

  expect(sessionRequirementsList).toEqual([
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 4 }, { pointInSeconds: 60, sessionVolume: 5 }, { pointInSeconds: 120, sessionVolume: 7 }] },
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 3 }, { pointInSeconds: 60, sessionVolume: 5 }, { pointInSeconds: 120, sessionVolume: 7 }] },
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 3 }, { pointInSeconds: 60, sessionVolume: 5 }, { pointInSeconds: 120, sessionVolume: 6 }] },
  ]);
});

test('createSessionRequirementsList2', () => {
  const sessionRequirementsList = createSessionRequirementsList({
    growthPattern: 'LINEAR',
    graph: [
      { pointInSeconds: 0, sessionVolume: 1 },
    ],
  }, 3);

  expect(sessionRequirementsList).toEqual([
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 1 }] },
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 0 }] },
    { growthPattern: 'LINEAR', graph: [{ pointInSeconds: 0, sessionVolume: 0 }] },
  ]);
});

test('getDesiredSessionVolume', () => {
  const requirements = [
    { pointInSeconds: 0 * 60, sessionVolume: 10 },
    { pointInSeconds: 3 * 60, sessionVolume: 25 },
    { pointInSeconds: 6 * 60, sessionVolume: 40 },
    { pointInSeconds: 9 * 60, sessionVolume: 50 },
    { pointInSeconds: 12 * 60, sessionVolume: 30 },
    { pointInSeconds: 15 * 60, sessionVolume: 10 },
  ];
  const base = Date.now();
  let desiredVolume = getDesiredSessionVolume(new Date(base), requirements);
  expect(desiredVolume).toEqual(10);
  desiredVolume = getDesiredSessionVolume(new Date(base - (0 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toBeGreaterThanOrEqual(10);
  expect(desiredVolume).toBeLessThanOrEqual(25);
  desiredVolume = getDesiredSessionVolume(new Date(base - (3 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toBeGreaterThanOrEqual(25);
  expect(desiredVolume).toBeLessThanOrEqual(40);
  desiredVolume = getDesiredSessionVolume(new Date(base - (6 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toBeGreaterThanOrEqual(40);
  expect(desiredVolume).toBeLessThanOrEqual(50);
  desiredVolume = getDesiredSessionVolume(new Date(base - (9 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toBeGreaterThanOrEqual(30);
  expect(desiredVolume).toBeLessThanOrEqual(50);
  desiredVolume = getDesiredSessionVolume(new Date(base - (12 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toBeGreaterThanOrEqual(10);
  expect(desiredVolume).toBeLessThanOrEqual(30);
  desiredVolume = getDesiredSessionVolume(new Date(base - (15 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(10);
});

test('getDesiredSessionVolume2', () => {
  const requirements = [
    { pointInSeconds: 0, sessionVolume: 1 },
  ];
  const base = Date.now();
  let desiredVolume = getDesiredSessionVolume(new Date(base), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (0 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (3 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (6 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (9 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (12 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
  desiredVolume = getDesiredSessionVolume(new Date(base - (15 * 60 + 30) * 1000), requirements);
  expect(desiredVolume).toEqual(1);
});
