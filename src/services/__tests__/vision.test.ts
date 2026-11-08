jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../supabase', () => ({ supabase: null }));
import { readPhotoWithVision, withTimeout } from '../vision';

describe('withTimeout', () => {
  it('gives up instead of hanging', async () => {
    jest.useFakeTimers();
    const p = withTimeout(new Promise<string>(() => {}), 1000, 'unavailable');
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBe('unavailable');
    jest.useRealTimers();
  });
  it('passes a quick answer through, and a failure becomes the fallback', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'unavailable')).resolves.toBe('ok');
    await expect(withTimeout(Promise.reject(new Error('x')), 1000, 'unavailable')).resolves.toBe('unavailable');
  });
});

it('is unavailable without a backend', async () => {
  await expect(readPhotoWithVision('file:///x.jpg')).resolves.toBe('unavailable');
});
