export type Exposure = 0 | 10 | 100;
export type ReleaseLane = 'previous' | 'candidate';

export async function rollOut<T>(driver: {
  setExposure(percent: Exposure): Promise<void>;
  verify(lane: ReleaseLane): Promise<T>;
}) {
  await driver.setExposure(0);
  await driver.verify('previous');
  try {
    await driver.setExposure(10);
    await driver.verify('candidate');
    await driver.verify('previous');
    await driver.setExposure(100);
    return await driver.verify('candidate');
  } catch (candidateError) {
    try {
      await driver.setExposure(0);
      await driver.verify('previous');
    } catch (recoveryError) {
      throw new AggregateError([candidateError, recoveryError], 'Candidate and rollback verification both failed.');
    }
    throw new Error('Candidate failed and previous build was verified.', { cause: candidateError });
  }
}
