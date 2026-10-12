import {it,expect} from 'vitest';
import {getShieldStatus} from '../src/modules/security/ShieldClient';
import {getTrustedDeviceSummary} from '../src/modules/sessions/DeviceTrust';
import {sessionService} from '../src/modules/sessions/SessionService';
import {calculateSessionRisk} from '../src/modules/sessions/RiskScoring';
it('does not infer trusted-device enrollment or Shield enforcement from legacy adapters',()=>{
 expect(getTrustedDeviceSummary()).toMatchObject({status:'UNAVAILABLE',trusted:false,activeDevices:null,method:null});
 expect(getShieldStatus()).toMatchObject({status:'Unavailable',enabled:false});
 expect(sessionService.getTrustedDeviceState()).toMatchObject({trusted:false,risk:'Unavailable'});
});
it('never classifies fabricated device and event counts as verified security',()=>{
 for(const data of [undefined,{}, {activeDevices:0,recentEvents:0},{activeDevices:2,recentEvents:3},{activeDevices:10,recentEvents:50}])expect(calculateSessionRisk(data)).toBe('Unavailable');
});
