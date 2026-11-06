#!/usr/bin/env python3
"""Roda depois de `npx cap add android`: aplica o que é do Bukid no projeto gerado (compartilhar, link de login, permissões, ícones, versão)."""
import os, re, shutil, subprocess, sys
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = os.path.join(root, 'android', 'app')
main = os.path.join(app, 'src', 'main')
manifest_path = os.path.join(main, 'AndroidManifest.xml')

# 1) código nativo (plugin de compartilhamento + MainActivity que o registra)
java_dir = os.path.join(main, 'java', 'app', 'bukid')
os.makedirs(java_dir, exist_ok=True)
for name in ('BukidNativePlugin.java', 'MainActivity.java'):
    shutil.copy(os.path.join(root, 'android-overrides', 'java', name), os.path.join(java_dir, name))

# 2) manifesto: receber compartilhamento de texto, voltar do login por bukid://auth e permissões
s = open(manifest_path, encoding='utf-8').read()
filters = '''
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="bukid" android:host="auth" />
            </intent-filter>
'''
if 'android:scheme="bukid"' not in s:
    s = s.replace('</activity>', filters + '        </activity>', 1)
perms = ['android.permission.POST_NOTIFICATIONS', 'android.permission.USE_EXACT_ALARM', 'android.permission.RECEIVE_BOOT_COMPLETED']
for perm in perms:
    if perm not in s:
        s = s.replace('</manifest>', f'    <uses-permission android:name="{perm}" />\n</manifest>')
open(manifest_path, 'w', encoding='utf-8').write(s)

# 3) ícones a partir de public/icon-512.png (e ícone pequeno das notificações)
icon = os.path.abspath(os.path.join(root, '..', 'public', 'icon-512.png'))
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
res = os.path.join(main, 'res')
shutil.rmtree(os.path.join(res, 'mipmap-anydpi-v26'), ignore_errors=True)  # usa os PNG abaixo em vez do ícone adaptativo padrão do Capacitor
for density, px in sizes.items():
    folder = os.path.join(res, f'mipmap-{density}')
    os.makedirs(folder, exist_ok=True)
    for name in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
        subprocess.run(['convert', icon, '-resize', f'{px}x{px}', os.path.join(folder, name)], check=True)
drawable = os.path.join(res, 'drawable')
os.makedirs(drawable, exist_ok=True)
# silhueta branca (anéis) sobre transparente: é o que o Android espera no ícone pequeno da notificação
tmp = os.path.join(drawable, 'mask.tmp.png')
subprocess.run(['convert', icon, '-resize', '96x96', '(', '+clone', '-alpha', 'extract', ')', '(', '-clone', '0', '-alpha', 'off', '-colorspace', 'Gray', '-threshold', '70%', ')', '-delete', '0', '-compose', 'Multiply', '-composite', tmp], check=True)
subprocess.run(['convert', '-size', '96x96', 'xc:white', tmp, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', os.path.join(drawable, 'ic_stat_bukid.png')], check=True)
os.remove(tmp)

# 4) versão: o número da execução do GitHub vira o versionCode (cada APK novo pode atualizar o anterior)
run = os.environ.get('GITHUB_RUN_NUMBER', '1')
gradle_path = os.path.join(app, 'build.gradle')
g = open(gradle_path, encoding='utf-8').read()
g = re.sub(r'versionCode\s+\d+', f'versionCode {run}', g)
g = re.sub(r'versionName\s+"[^"]*"', f'versionName "1.0.{run}"', g)
open(gradle_path, 'w', encoding='utf-8').write(g)
print('Projeto Android preparado (versão 1.0.%s).' % run)
