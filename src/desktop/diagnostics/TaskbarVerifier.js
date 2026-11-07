'use strict';
// Smoke-test check of the native Windows taskbar properties (application id, relaunch command, icon, name).
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const PortableLauncher = require('../platform/PortableLauncher');

class TaskbarVerifier {
  static async verifyTaskbar(window, launcher) {
    const source = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid format; public uint id; }
[StructLayout(LayoutKind.Explicit, Size=24)] public struct PropertyValue {
    [FieldOffset(0)] public ushort type;
    [FieldOffset(8)] public IntPtr text;
}
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
    void GetCount(out uint count);
    void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, out PropertyValue value);
    void SetValue(ref PropertyKey key, ref PropertyValue value);
    void Commit();
}
public static class TaskbarProperties {
    [DllImport("shell32.dll", PreserveSig=false)]
    static extern void SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropertyValue value);
    public static string[] Read(long hwnd) {
        Guid iid = typeof(IPropertyStore).GUID;
        IPropertyStore store;
        SHGetPropertyStoreForWindow(new IntPtr(hwnd), ref iid, out store);
        try {
            uint[] ids = { 5, 2, 3, 4 };
            string[] values = new string[4];
            for(int i=0;i<ids.Length;i++) {
                PropertyKey key = new PropertyKey { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id=ids[i] };
                PropertyValue value;
                store.GetValue(ref key, out value);
                try { values[i] = value.type == 31 ? Marshal.PtrToStringUni(value.text) : ""; }
                finally { PropVariantClear(ref value); }
            }
            return values;
        } finally { Marshal.FinalReleaseComObject(store); }
    }
}
'@
[TaskbarProperties]::Read([long]$env:ORBIT_VERIFY_HWND) | ConvertTo-Json -Compress
  `;
    const handle = window.getNativeWindowHandle(), hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
    const { stdout } = await promisify(execFile)(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 15000, env: { ...process.env, ORBIT_VERIFY_HWND: hwnd } });
    const [id, command, icon, name] = JSON.parse(stdout);
    if (id !== PortableLauncher.APP_ID || command !== `"${launcher}"` || ![launcher, `${launcher},0`, `"${launcher}",0`].includes(icon) || name !== 'OrbitKanban') {
      throw new Error(`Invalid Windows taskbar properties: ${JSON.stringify({ id, command, icon, name })}`);
    }
  }
}

module.exports = TaskbarVerifier;
