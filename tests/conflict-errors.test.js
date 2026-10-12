import {it,expect} from 'vitest';
import {safeFailure,AurevaError} from '../src/modules/security/safeEvents';
it('provides a safe reload instruction for both existing and non-retrying conflicts',()=>{
 for(const code of ['40001','PT409']){
  const message=safeFailure({code,message:'PRIVATE_SQL_AND_RECORD_CANARY'});
  expect(message).toMatch(/Reload the latest version/);expect(message).not.toContain('CANARY');
 }
});
it('preserves explicit history checkpoint guidance and sanitizes unrelated failures',()=>{
 expect(safeFailure(new AurevaError('HISTORY_CHANGED','Verify your latest checkpoint.'))).toBe('Verify your latest checkpoint.');
 expect(safeFailure({code:'42501',message:'PRIVATE_SQL_CANARY'})).not.toContain('CANARY');
});
