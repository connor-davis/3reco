import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { toast } from 'sonner';
import { ConvexError } from 'convex/values';
import { Shield, ShieldCheck, QrCode as QrCodeIcon } from 'lucide-react';

export default function MfaSuggestionDialog() {
  const shouldShow = useConvexQuery(api.mfa.shouldShowMfaSuggestion);
  const skip = useConvexMutation(api.mfa.skipMfaSuggestion);
  const setupTotp = useConvexMutation(api.mfa.setupTOTP);
  const verifyTotp = useConvexMutation(api.mfa.verifyAndEnableTOTP);
  const markShown = useConvexMutation(api.mfa.markMfaSuggestionShown);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'suggestion' | 'setup' | 'verify'>('suggestion');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    if (shouldShow) {
      setOpen(true);
    }
  }, [shouldShow]);

  const handleSkip = async () => {
    try {
      await skip({});
      setOpen(false);
    } catch (error) {
      if (error instanceof ConvexError) {
        toast.error(error.data.name, {
          description: error.data.message,
        });
      }
    }
  };

  const handleSetup = async () => {
    try {
      const result = await setupTotp({});
      setSecret(result.secret);

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(result.qrCode, {
        width: 300,
        margin: 2,
      });
      setQrCodeData(qrCodeDataUrl);
      setStep('setup');
    } catch (error) {
      if (error instanceof ConvexError) {
        toast.error(error.data.name, {
          description: error.data.message,
        });
      }
    }
  };

  const handleVerify = async () => {
    try {
      await verifyTotp({ code });
      await markShown({});
      toast.success('Success', {
        description: 'MFA has been enabled successfully!',
      });
      setOpen(false);
    } catch (error) {
      if (error instanceof ConvexError) {
        toast.error(error.data.name, {
          description: error.data.message,
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        {step === 'suggestion' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="size-8 text-primary" />
                <DialogTitle>Enhance Your Account Security</DialogTitle>
              </div>
              <DialogDescription>
                Add an extra layer of security to your account with Multi-Factor
                Authentication (MFA). This helps protect your account even if your
                password is compromised.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <h4 className="font-medium flex items-center gap-2">
                  <ShieldCheck className="size-5" />
                  What is MFA?
                </h4>
                <p className="text-sm text-muted-foreground">
                  MFA requires a verification code from your authenticator app (like
                  Google Authenticator or Authy) in addition to your password when
                  signing in.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button onClick={handleSetup} className="w-full">
                  Set Up MFA Now
                </Button>
                <Button onClick={handleSkip} variant="ghost" className="w-full">
                  Skip for Now
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                You can always enable MFA later from your profile settings.
              </p>
            </div>
          </>
        )}

        {step === 'setup' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <QrCodeIcon className="size-8 text-primary" />
                <DialogTitle>Scan QR Code</DialogTitle>
              </div>
              <DialogDescription>
                Scan this QR code with your authenticator app (Google Authenticator,
                Authy, etc.)
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4 items-center">
              {qrCodeData && (
                <img
                  src={qrCodeData}
                  alt="QR Code for MFA setup"
                  className="rounded-lg border"
                />
              )}

              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium">Or enter this code manually:</p>
                <code className="text-xs bg-muted p-2 rounded text-center">
                  {secret}
                </code>
              </div>

              <Button onClick={() => setStep('verify')} className="w-full">
                Next: Verify Code
              </Button>
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="size-8 text-primary" />
                <DialogTitle>Verify Authentication Code</DialogTitle>
              </div>
              <DialogDescription>
                Enter the 6-digit code from your authenticator app to complete setup.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="mfa-code">Verification Code</FieldLabel>
                  <Input
                    id="mfa-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="text-center text-2xl tracking-widest"
                  />
                  <FieldDescription>
                    Enter the 6-digit code from your authenticator app
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep('setup')}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={code.length !== 6}
                  className="flex-1"
                >
                  Verify & Enable MFA
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
