import { createRoot } from 'react-dom/client';
import type { WhatsAppMultiDeviceConfig, ChatTagsResolver, ChatActionsResolver } from './lib/providers/types';
import { mount } from './index';
import './app/globals.css';

async function loadConfig(): Promise<WhatsAppMultiDeviceConfig> {
  try {
    const res = await fetch('/devices.json');
    if (res.ok) {
      const json = (await res.json()) as WhatsAppMultiDeviceConfig;
      if (json.devices && json.devices.length > 0) {
        return json;
      }
    }
  } catch {
    // fetch failed
  }

  createRoot(document.getElementById('app')!).render(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'sans-serif', color: '#667781' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h2 style={{ color: '#111b21', marginBottom: 8 }}>Missing Configuration</h2>
        <p>Create a <code>devices.json</code> file in the project root:</p>
        <pre style={{ background: '#f0f2f5', padding: 12, borderRadius: 8, marginTop: 8, textAlign: 'left' }}>{`{
  "devices": [{
    "id": "main",
    "label": "Main",
    "apiUrl": "http://localhost:8080",
    "instanceToken": "your-instance-token",
    "instanceName": "your-instance"
  }]
}`}</pre>
        <p style={{ marginTop: 8, fontSize: 13 }}>See <code>devices.example.json</code> for a full example.</p>
      </div>
    </div>
  );
  throw new Error('Missing devices.json');
}

const devChatTags: ChatTagsResolver = (chat) => {
  const tags = [];
  // Assign tags based on chat properties for demo purposes
  if (chat.unreadCount && chat.unreadCount > 0) {
    tags.push({ id: 'unread', label: 'Unread', background: '#ff9800', color: 'white' });
  }
  if (chat.contactName) {
    tags.push({ id: 'saved', label: 'Saved Contact', background: '#2196f3' });
  }
  // Give ~1/3 of chats a VIP tag based on phone number hash
  const hash = chat.phoneNumber.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (hash % 3 === 0) {
    tags.push({ id: 'vip', label: 'VIP', background: '#e91e63' });
  }
  if (hash % 4 === 0) {
    tags.push({ id: 'priority', label: 'Priority', background: '#9c27b0' });
  }
  return tags;
};

const devChatActions: ChatActionsResolver = (chat) => {
  const actions = [];

  if (chat.contactName) {
    actions.push({
      id: 'open-crm',
      label: 'Open in CRM',
      onClick: () => console.log('[dev] Open in CRM:', chat.contactName, chat.phoneNumber),
    });
  }

  actions.push({
    id: 'search-crm',
    label: 'Search CRM',
    onClick: () => console.log('[dev] Search CRM:', chat.phoneNumber),
  });

  actions.push({
    id: 'tag-vip',
    label: 'Tag as VIP',
    onClick: () => console.log('[dev] Tag as VIP:', chat.phoneNumber),
  });

  return actions;
};

loadConfig().then((config) => {
  const inbox = mount(document.getElementById('app')!, {
    ...config,
    chatTags: devChatTags,
    chatActions: devChatActions,
  });
  // Expose the inbox API for E2E testing and development convenience
  (window as unknown as Record<string, unknown>).__whatsappInbox = inbox;

  // Populate the dev sidebar
  const sidebar = document.getElementById('dev-sidebar')!;

  function section(title: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px 16px 8px';
    const h = document.createElement('p');
    h.textContent = title;
    h.style.cssText = 'color:#8696a0;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px';
    wrap.appendChild(h);
    sidebar.appendChild(wrap);
    return wrap;
  }

  function btn(label: string, onClick: () => void, accent = '#00a884'): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = [
      `background:${accent}`, 'color:#fff', 'border:none', 'border-radius:8px',
      'padding:9px 12px', 'font-size:13px', 'font-weight:500', 'cursor:pointer',
      'text-align:left', 'width:100%', 'display:block', 'margin-bottom:6px',
      'transition:opacity 150ms',
    ].join(';');
    b.addEventListener('mouseover', () => { b.style.opacity = '0.8'; });
    b.addEventListener('mouseout', () => { b.style.opacity = '1'; });
    b.addEventListener('click', onClick);
    return b;
  }

  // ── Section: Open conversation ──────────────────────────────────────────
  const s1 = section('Open conversation');
  s1.appendChild(btn('Ana Beatriz (device 1)', () => inbox.selectConversation('556992924255', undefined, 'mock-device-1')));
  s1.appendChild(btn('Carlos Eduardo (device 1)', () => inbox.selectConversation('5511987654321', undefined, 'mock-device-1')));
  s1.appendChild(btn('Sarah Johnson (device 2)', () => inbox.selectConversation('15551234567', undefined, 'mock-device-2')));
  s1.appendChild(btn('James Wright (device 2)', () => inbox.selectConversation('447911123456', undefined, 'mock-device-2')));

  // ── Section: Open with prefill ──────────────────────────────────────────
  const s2 = section('Open with prefill');
  s2.appendChild(btn('Ana Beatriz + prefill', () =>
    inbox.selectConversation('556992924255', 'Hello, I have a question!', 'mock-device-1'), '#2563eb'));
  s2.appendChild(btn('Sarah Johnson + prefill', () =>
    inbox.selectConversation('15551234567', 'Following up on your request', 'mock-device-2'), '#2563eb'));

  // ── Section: Start new chat ─────────────────────────────────────────────
  const s3 = section('Start new chat');

  // Show per-device initiation capability
  for (const device of config.devices) {
    const caps = device.capabilities?.conversationInitiation;
    const canInit = caps?.canInitiate ?? true; // default: phone-based free initiation
    const idType = caps?.identifierType ?? 'phone';
    const tag = document.createElement('p');
    tag.style.cssText = 'font-size:11px;margin-bottom:6px;color:#667781';
    tag.innerHTML = `<strong>${device.label || device.id}</strong>: ${canInit ? `✅ can initiate (${idType})` : '❌ cannot initiate'}`;
    s3.appendChild(tag);
  }

  // Input row for openChat
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:4px';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Phone number…';
  input.style.cssText = [
    'flex:1', 'background:#f0f2f5', 'border:none', 'border-radius:8px',
    'padding:8px 10px', 'font-size:13px', 'color:#111b21', 'outline:none',
  ].join(';');
  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open';
  openBtn.style.cssText = [
    'background:#00a884', 'color:#fff', 'border:none', 'border-radius:8px',
    'padding:8px 12px', 'font-size:13px', 'font-weight:500', 'cursor:pointer',
    'white-space:nowrap', 'transition:opacity 150ms',
  ].join(';');
  openBtn.addEventListener('mouseover', () => { openBtn.style.opacity = '0.8'; });
  openBtn.addEventListener('mouseout', () => { openBtn.style.opacity = '1'; });
  openBtn.addEventListener('click', () => {
    const phone = input.value.trim().replace(/\D/g, '');
    if (phone) inbox.openChat(phone);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openBtn.click();
  });
  row.appendChild(input);
  row.appendChild(openBtn);
  s3.appendChild(row);

  // Per-device openChat buttons to test the gate
  s3.appendChild(btn('Open new on WhatsApp 1', () =>
    inbox.openChat('5599999999999', { deviceId: 'mock-device-1' })));
  s3.appendChild(btn('Open new on Instagram (blocked)', () =>
    inbox.openChat('99999', { deviceId: 'mock-device-2' }), '#e91e63'));
});
