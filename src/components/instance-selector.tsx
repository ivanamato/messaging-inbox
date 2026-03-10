import { useEffect, useState, useRef } from 'react';
import { ChevronDown, WifiOff, Loader2, Check, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useDeviceContext } from '@/lib/provider-context';
import { useTranslations } from '@/lib/i18n';
import { useDeviceStatus } from '@/use-cases/use-device-status';
import type { DeviceConfig, ViewMode } from '@/lib/providers/types';
import type { DeviceStatus } from '@/use-cases/use-device-status';

type Props = {
  onDeviceChange: (device: { instanceName: string; provider: string } | null) => void;
};

export function InstanceSelector({ onDeviceChange }: Props) {
  const { devices, selectedDevice, selectDevice, viewMode, setViewMode } = useDeviceContext();
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const { statuses, initialLoad, connectedCount } = useDeviceStatus();

  // Notify parent when selected device changes
  useEffect(() => {
    if (selectedDevice) {
      onDeviceChange({
        instanceName: selectedDevice.instanceName,
        provider: selectedDevice.providerType || 'evolution',
      });
    }
  }, [selectedDevice, onDeviceChange]);

  if (initialLoad) {
    return (
      <div className="wa:flex wa:items-center wa:justify-center wa:gap-3 wa:px-4 wa:py-3 wa:text-base wa:text-[#8696a0]">
        <Loader2 className="wa:h-5 wa:w-5 wa:animate-spin" />
        {t('instanceSelector.loadingDevices')}
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="wa:flex wa:items-center wa:justify-center wa:gap-3 wa:px-4 wa:py-3 wa:text-base wa:text-red-400">
        <WifiOff className="wa:h-5 wa:w-5" />
        {t('instanceSelector.noDevicesConfigured')}
      </div>
    );
  }

  const showToggle = devices.length > 1;

  return (
    <>
      <div className="wa:flex wa:items-center wa:gap-2 wa:w-full">
        {/* View mode toggle — hidden if only 1 device */}
        {showToggle && (
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}

        {/* Single mode: device picker button */}
        {viewMode === 'single' ? (
          <button
            onClick={() => setOpen(true)}
            className="wa:flex wa:flex-1 wa:items-center wa:justify-center wa:gap-3 wa:px-4 wa:py-3 wa:rounded-lg hover:wa:bg-white/10 wa:transition-colors wa:min-w-0"
          >
            <StatusDot status={selectedDevice ? (statuses[selectedDevice.id] || 'close') : 'close'} />
            <span className="wa:text-base wa:font-medium wa:text-[#e9edef] wa:truncate">
              {selectedDevice?.label || selectedDevice?.instanceName || t('instanceSelector.selectDevice')}
            </span>
            <Badge variant="outline" className="wa:text-xs wa:px-2 wa:py-0.5 wa:h-5 wa:uppercase wa:text-[#8696a0] wa:border-[#8696a0]/40">
              {(selectedDevice?.providerType || 'evolution') === 'evolution' ? 'EVO' : 'GEN'}
            </Badge>
            <ChevronDown className="wa:h-5 wa:w-5 wa:text-[#8696a0]" />
          </button>
        ) : (
          /* All mode: summary label */
          <div className="wa:flex wa:flex-1 wa:items-center wa:justify-center wa:gap-3 wa:px-4 wa:py-3 wa:min-w-0">
            <span className="wa:text-base wa:font-medium wa:text-[#e9edef] wa:truncate">
              {t('instanceSelector.allDevices')}
            </span>
            <Badge variant="outline" className="wa:text-xs wa:text-[#8696a0] wa:border-[#8696a0]/40" style={{ padding: '4px 12px' }}>
              {connectedCount} {t('instanceSelector.connected')}
            </Badge>
          </div>
        )}
      </div>

      {open && viewMode === 'single' && (
        <SimpleModal onClose={() => setOpen(false)}>
          <div className="wa:mb-2 wa:flex wa:flex-col wa:gap-2 wa:text-center">
            <h2 className="wa:text-lg wa:leading-none wa:font-semibold wa:text-[#e9edef]">{t('instanceSelector.selectDevice')}</h2>
          </div>
          <div className="wa:flex wa:flex-col wa:gap-3">
            {devices.map((device) => (
              <DeviceOption
                key={device.id}
                device={device}
                status={statuses[device.id] || 'close'}
                isSelected={selectedDevice?.id === device.id}
                onSelect={() => {
                  selectDevice(device.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </SimpleModal>
      )}
    </>
  );
}

function SimpleModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useTranslations();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="wa:fixed wa:inset-0 wa:z-50 wa:bg-black/50 wa:flex wa:items-center wa:justify-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="wa:bg-[#111b21] wa:border wa:border-[#3b4a54] wa:max-w-md wa:w-full wa:max-w-[calc(100%-2rem)] wa:rounded-lg wa:shadow-lg wa:relative"
        style={{ padding: 32 }}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="wa:absolute wa:top-4 wa:right-4 wa:rounded-xs wa:opacity-70 wa:transition-opacity hover:wa:opacity-100 wa:text-[#8696a0]"
        >
          <XIcon className="wa:h-4 wa:w-4" />
          <span className="wa:sr-only">{t('instanceSelector.close')}</span>
        </button>
        {children}
      </div>
    </div>
  );
}

function DeviceOption({
  device,
  status,
  isSelected,
  onSelect,
}: {
  device: DeviceConfig;
  status: DeviceStatus;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'wa:w-full wa:flex wa:items-center wa:gap-3 wa:px-4 wa:py-3.5 wa:rounded-lg wa:transition-colors',
        isSelected
          ? 'wa:bg-[#00a884]/20 wa:border wa:border-[#00a884]/40'
          : 'wa:bg-[#233138] hover:wa:bg-[#2a3942] wa:border wa:border-transparent'
      )}
    >
      <StatusDot status={status} />
      <div className="wa:flex-1 wa:min-w-0 wa:text-left">
        <p className="wa:text-base wa:font-medium wa:text-[#e9edef] wa:truncate">
          {device.label || device.instanceName}
        </p>
        {device.label && (
          <p className="wa:text-xs wa:text-[#8696a0] wa:truncate">{device.instanceName}</p>
        )}
      </div>
      <Badge variant="outline" className="wa:text-xs wa:px-2 wa:py-0.5 wa:h-5 wa:uppercase wa:flex-shrink-0 wa:text-[#8696a0] wa:border-[#8696a0]/40">
        {(device.providerType || 'evolution') === 'evolution' ? 'EVO' : 'GEN'}
      </Badge>
      {isSelected && (
        <Check className="wa:h-5 wa:w-5 wa:text-[#00a884] wa:flex-shrink-0" />
      )}
    </button>
  );
}

function ViewModeToggle({ viewMode, onViewModeChange }: { viewMode: ViewMode; onViewModeChange: (mode: ViewMode) => void }) {
  const t = useTranslations();
  const isAll = viewMode === 'all';
  return (
    <label className="wa:flex wa:items-center wa:gap-2 wa:flex-shrink-0 wa:cursor-pointer wa:select-none">
      <button
        data-testid="merge-devices-toggle"
        role="switch"
        aria-checked={isAll}
        onClick={() => onViewModeChange(isAll ? 'single' : 'all')}
        className={cn(
          'wa:relative wa:inline-flex wa:h-5 wa:w-9 wa:items-center wa:rounded-full wa:transition-colors wa:flex-shrink-0',
          isAll ? 'wa:bg-[#00a884]' : 'wa:bg-[#3b4a54]'
        )}
      >
        <span
          className={cn(
            'wa:inline-block wa:h-3.5 wa:w-3.5 wa:rounded-full wa:bg-white wa:transition-transform',
            isAll ? 'wa:translate-x-[18px]' : 'wa:translate-x-[3px]'
          )}
        />
      </button>
      <span className="wa:text-xs wa:text-[#8696a0] wa:whitespace-nowrap">{t('instanceSelector.mergeDevices')}</span>
    </label>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'wa:h-3 wa:w-3 wa:rounded-full wa:flex-shrink-0',
        status === 'open' && 'wa:bg-green-500',
        status === 'connecting' && 'wa:bg-yellow-500 wa:animate-pulse',
        (status === 'close' || status === 'loading') && 'wa:bg-red-400'
      )}
      title={status}
    />
  );
}
