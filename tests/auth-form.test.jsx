import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const auth=vi.hoisted(()=>({configured:true,signIn:vi.fn(),signUp:vi.fn(),requestPasswordReset:vi.fn(),resendConfirmation:vi.fn()}));
vi.mock('../src/lib/providers',()=>({AuthProvider:auth}));
vi.mock('../src/supabase',()=>({supabaseConfig:{configured:true}}));
import Auth from '../src/Auth';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('announces mode changes, links password guidance and conceals new passwords',()=>{
 render(<Auth/>);
 const input=screen.getByPlaceholderText('Enter your password');
 expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toContain('16 characters');
 fireEvent.click(screen.getByRole('button',{name:'Show password'}));
 fireEvent.click(screen.getByRole('button',{name:'Create an account',exact:true}));
 expect(document.activeElement).toBe(screen.getByRole('heading',{name:'Make room for what matters.'}));
 expect(screen.getByPlaceholderText('At least 16 characters').type).toBe('password');
});
it('does not present unavailable passkeys as an enabled sign-in method',()=>{
 render(<Auth/>);
 expect(screen.getByRole('button',{name:/Use Passkey/}).disabled).toBe(true);
});
it('submits account credentials through the adapter and clears the password on success',async()=>{
 auth.signIn.mockResolvedValue({});render(<Auth/>);
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.change(screen.getByPlaceholderText('Enter your password'),{target:{value:'test password'}});
 fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
 await waitFor(()=>expect(auth.signIn).toHaveBeenCalledWith('owner@example.invalid','test password'));
 await waitFor(()=>expect(screen.getByPlaceholderText('Enter your password').value).toBe(''));
});
it('shows a retryable sign-in error without entering the vault',async()=>{
 auth.signIn.mockRejectedValue(new Error('Invalid login credentials'));render(<Auth/>);
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.change(screen.getByPlaceholderText('Enter your password'),{target:{value:'wrong'}});
 fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
 await screen.findByRole('alert');
 expect(screen.getByRole('button',{name:'Sign in',exact:true}).disabled).toBe(false);
});
it('uses a generic recovery response that does not disclose account existence',async()=>{
 auth.requestPasswordReset.mockResolvedValue({});render(<Auth/>);
 fireEvent.click(screen.getByRole('button',{name:'Forgot password?'}));
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.submit(screen.getByLabelText('Email address').closest('form'));
 await screen.findByRole('status');
 expect(screen.getByRole('status').textContent).toContain('If an account exists');
 expect(auth.requestPasswordReset).toHaveBeenCalledWith('owner@example.invalid',window.location.origin);
});
it('requests confirmation without a password and prevents repeated requests during cooldown',async()=>{
 auth.resendConfirmation.mockResolvedValue({});render(<Auth/>);
 fireEvent.click(screen.getByRole('button',{name:'Need a confirmation email?'}));
 expect(screen.queryByLabelText('Password')).toBeNull();
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.submit(screen.getByLabelText('Email address').closest('form'));
 await screen.findByRole('status');
 expect(auth.resendConfirmation).toHaveBeenCalledWith('owner@example.invalid',window.location.origin);
 expect(screen.getByRole('status').textContent).toContain('If this account still needs confirmation');
 expect(screen.getByRole('button',{name:/Try again in/}).disabled).toBe(true);
 fireEvent.submit(screen.getByLabelText('Email address').closest('form'));
 expect(auth.resendConfirmation).toHaveBeenCalledTimes(1);
});
it('keeps confirmation failures retryable and does not claim delivery',async()=>{
 auth.resendConfirmation.mockRejectedValue(new Error('Email service unavailable'));render(<Auth/>);
 fireEvent.click(screen.getByRole('button',{name:'Need a confirmation email?'}));
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.submit(screen.getByLabelText('Email address').closest('form'));
 await screen.findByRole('alert');
 expect(screen.queryByRole('status')).toBeNull();
 expect(screen.getByRole('button',{name:'Resend confirmation',exact:true}).disabled).toBe(false);
});
it('explains that existing accounts may not receive a new signup email',async()=>{
 auth.signUp.mockResolvedValue({});render(<Auth/>);
 fireEvent.click(screen.getByRole('button',{name:'Create an account',exact:true}));
 fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Test'}});
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'owner@example.invalid'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'a-long-test-password'}});
 fireEvent.submit(screen.getByLabelText('Email address').closest('form'));
 await screen.findByRole('status');
 expect(screen.getByRole('status').textContent).toContain('another signup may not send an email');
});

