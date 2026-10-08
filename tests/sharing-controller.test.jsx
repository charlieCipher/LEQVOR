import {afterEach,it,expect,vi} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import {useSharingController} from '../src/components/people/useSharingController';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('loads metadata without reveal and clears plaintext on blur and timeout',async()=>{
 vi.useFakeTimers();
 const service={list:vi.fn().mockResolvedValue([{id:'grant'}]),reveal:vi.fn().mockResolvedValue({payload:{instructions:'PRIVATE'}})};
 const {result}=renderHook(()=>useSharingController(service));
 await act(()=>result.current.load());expect(result.current.shares).toEqual([{id:'grant'}]);expect(service.reveal).not.toHaveBeenCalled();
 await act(()=>result.current.reveal('grant'));expect(result.current.revealed).not.toBeNull();
 act(()=>window.dispatchEvent(new Event('blur')));expect(result.current.revealed).toBeNull();
 await act(()=>result.current.reveal('grant'));act(()=>vi.advanceTimersByTime(30000));expect(result.current.revealed).toBeNull();
});
it('downloads only an explicitly revealed grant attachment and clears returned bytes',async()=>{
 const bytes=new Uint8Array([1,2,3]),save=vi.fn();
 const service={list:vi.fn(),reveal:vi.fn().mockResolvedValue({payload:{instructions:'PRIVATE'}}),files:vi.fn().mockResolvedValue([{file_id:'file'}]),download:vi.fn().mockResolvedValue({name:'PRIVATE_FILE',bytes})};
 const {result}=renderHook(()=>useSharingController(service,save));
 await act(()=>result.current.download('file'));expect(service.download).not.toHaveBeenCalled();
 await act(()=>result.current.reveal('grant'));
 await act(()=>result.current.download('not-selected'));expect(service.download).not.toHaveBeenCalled();
 await act(()=>result.current.download('file'));expect(service.download).toHaveBeenCalledWith('grant','file');expect(save).toHaveBeenCalledTimes(1);expect(bytes).toEqual(new Uint8Array(3));
});
it('discards and clears a late download after hide or focus loss, and blocks duplicate downloads',async()=>{
 const save=vi.fn();let finish;
 const service={reveal:vi.fn().mockResolvedValue({payload:{}}),files:vi.fn().mockResolvedValue([{file_id:'file'}]),download:vi.fn(()=>new Promise(resolve=>{finish=resolve;}))};
 const {result}=renderHook(()=>useSharingController(service,save));
 for(const clear of [()=>result.current.hide(),()=>window.dispatchEvent(new Event('blur'))]){
  await act(()=>result.current.reveal('grant'));let pending;
  act(()=>{pending=result.current.download('file');result.current.download('file');});
  act(clear);const bytes=new Uint8Array([8]);await act(async()=>{finish({name:'PRIVATE_FILE',bytes});await pending;});
  expect(bytes[0]).toBe(0);expect(save).not.toHaveBeenCalled();
 }
 expect(service.download).toHaveBeenCalledTimes(2);
});
it('discards responses after focus loss and sanitizes failures',async()=>{
 let finish;const service={list:vi.fn(),reveal:()=>new Promise(resolve=>{finish=resolve;})};
 const {result}=renderHook(()=>useSharingController(service));
 let pending;act(()=>{pending=result.current.reveal('grant');});
 act(()=>window.dispatchEvent(new Event('blur')));
 await act(async()=>{finish({payload:{instructions:'PRIVATE'}});await pending;});expect(result.current.revealed).toBeNull();
 service.list.mockRejectedValueOnce(new Error('PRIVATE_ERROR'));await act(()=>result.current.load());expect(result.current.error).not.toContain('PRIVATE_ERROR');
});
it('clears active state when the vault session locks and never exposes it under another service',async()=>{
 let lock;const service={session:{subscribe:callback=>{lock=callback;return()=>{};}},list:vi.fn(),reveal:vi.fn().mockResolvedValue({payload:{instructions:'PRIVATE'}})};
 const {result,rerender}=renderHook(({current})=>useSharingController(current),{initialProps:{current:service}});
 await act(()=>result.current.reveal('grant'));act(()=>lock());expect(result.current.revealed).toBeNull();
 await act(()=>result.current.reveal('grant'));rerender({current:{list:vi.fn(),reveal:vi.fn()}});expect(result.current.revealed).toBeNull();
});
