import {
  ApiKeySchema,
  type ConnectionTestResult,
  type DesktopSettings,
  type EvmDesktopApi,
  ModelNameSchema,
} from '@evm/platform/bridge';
import { KeyRound, PlugZap, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { useToast } from '../state/ToastProvider';

type Busy = 'save' | 'test' | 'remove' | null;

/**
 * FR-52: Gemini key and model for the desktop app. The key is encrypted by the main process
 * with Electron safeStorage; after saving, the renderer only ever sees its last 4 characters.
 */
export function DesktopAiSettings({ bridge }: { bridge: EvmDesktopApi }) {
  const toast = useToast();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [errors, setErrors] = useState<{ model?: string; apiKey?: string }>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    bridge
      .getSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setModel(loaded.model);
      })
      .catch(() => active && setLoadFailed(true));
    bridge
      .getAppVersion()
      .then((v) => active && setVersion(v))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bridge]);

  const apply = (next: DesktopSettings) => {
    setSettings(next);
    setModel(next.model);
    setApiKey('');
    setTest(null);
  };

  const save = async () => {
    const modelCheck = ModelNameSchema.safeParse(model);
    const keyCheck = apiKey.trim() ? ApiKeySchema.safeParse(apiKey) : null;
    const nextErrors = {
      model: modelCheck.success ? undefined : `Model ${modelCheck.error.issues[0]!.message}.`,
      apiKey:
        keyCheck && !keyCheck.success ? `The key ${keyCheck.error.issues[0]!.message}.` : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.model || nextErrors.apiKey) return;
    setBusy('save');
    try {
      apply(
        await bridge.saveSettings({
          model: modelCheck.data,
          ...(keyCheck?.success ? { apiKey: keyCheck.data } : {}),
        }),
      );
      toast({ tone: 'success', title: keyCheck ? 'API key saved' : 'Settings saved' });
    } catch {
      toast({ tone: 'error', title: 'Could not save the settings' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      apply(await bridge.saveSettings({ apiKey: null }));
      toast({ tone: 'success', title: 'API key removed' });
    } catch {
      toast({ tone: 'error', title: 'Could not remove the API key' });
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy('test');
    try {
      setTest(await bridge.testAiConnection());
    } catch {
      setTest({ ok: false, message: 'The connection test could not run.' });
    } finally {
      setBusy(null);
    }
  };

  const hasKey = settings?.hasApiKey ?? false;
  const canEncrypt = settings?.encryptionAvailable ?? true;

  return (
    <Card
      title="Desktop: Gemini API key"
      description="Used for AI summaries in the desktop app. The key is encrypted with your Windows account (Electron safeStorage) and is never shown again after saving. Without a key, or offline, the app writes a rule-based summary instead."
      className="lg:col-span-2"
    >
      {loadFailed ? (
        <p className="text-control text-error-strong">The desktop settings could not be read.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2" role="status">
            {hasKey ? (
              <Badge tone="success">{`Key saved ••••${settings?.apiKeyHint ?? ''}`}</Badge>
            ) : (
              <Badge tone="neutral">No key saved</Badge>
            )}
            {version && <span className="text-support text-muted">Desktop app {version}</span>}
          </div>
          {!canEncrypt && (
            <p className="text-control text-warning-strong">
              This computer cannot encrypt secrets, so an API key can't be saved. AI summaries will
              use the offline rule-based version.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Gemini model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              error={errors.model}
              hint="Copy the exact model name from Google AI Studio (a current “Flash” model)."
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Input
              label="API key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              error={errors.apiKey}
              hint={
                hasKey ? 'Leave empty to keep the saved key.' : 'From aistudio.google.com/apikey'
              }
              autoComplete="off"
              spellCheck={false}
              disabled={!canEncrypt}
              placeholder={hasKey ? 'Enter a new key to replace it' : 'Paste your key'}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={apiKey.trim() ? KeyRound : Save}
              onClick={() => void save()}
              disabled={busy !== null || !settings}
            >
              {apiKey.trim() ? 'Save key' : 'Save settings'}
            </Button>
            <Button
              icon={PlugZap}
              onClick={() => void testConnection()}
              disabled={busy !== null || !hasKey}
            >
              {busy === 'test' ? 'Testing…' : 'Test connection'}
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => void remove()}
              disabled={busy !== null || !hasKey}
            >
              Remove key
            </Button>
          </div>
          {test && (
            <p
              className="flex items-center gap-2 text-control"
              role="status"
              aria-label="Connection test result"
            >
              <Badge tone={test.ok ? 'success' : 'error'}>{test.ok ? 'Connected' : 'Failed'}</Badge>
              {test.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
