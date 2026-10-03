import { sendVerificationCode, verifyEmailVerificationCode } from '../api/authApi';

export const requestEmailVerificationCode = sendVerificationCode;
export const verifyEmailCode = verifyEmailVerificationCode;
