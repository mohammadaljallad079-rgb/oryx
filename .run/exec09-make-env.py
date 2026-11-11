import secrets
import pathlib

src = pathlib.Path('deploy/env/production.env.example')
dst = pathlib.Path('/tmp/oryx-exec09/.env.production')
dst.parent.mkdir(parents=True, exist_ok=True)
t = src.read_text()


def rnd(n=48):
    return secrets.token_urlsafe(n)[:n]


pw = rnd(32)
t = t.replace('ORYX_ADMIN_HOST=admin.CHANGE_ME', 'ORYX_ADMIN_HOST=admin.oryx.local')
t = t.replace('ORYX_CUSTOMER_HOST=www.CHANGE_ME', 'ORYX_CUSTOMER_HOST=www.oryx.local')
t = t.replace('CHANGE_ME_strong_database_password', pw)
t = t.replace('JWT_ACCESS_SECRET=CHANGE_ME_min_32_characters_long_random', 'JWT_ACCESS_SECRET=' + rnd(48))
t = t.replace('JWT_REFRESH_SECRET=CHANGE_ME_min_32_characters_long_random_different', 'JWT_REFRESH_SECRET=' + rnd(48))
t = t.replace('MFA_ENCRYPTION_KEY=CHANGE_ME_min_32_characters_long_random', 'MFA_ENCRYPTION_KEY=' + rnd(48))
t = t.replace('CORS_ORIGINS=https://admin.CHANGE_ME,https://www.CHANGE_ME',
              'CORS_ORIGINS=https://admin.oryx.local,https://www.oryx.local')
t = t.replace('NEXT_PUBLIC_API_BASE_URL=https://www.CHANGE_ME/api',
              'NEXT_PUBLIC_API_BASE_URL=https://www.oryx.local/api')
t = t.replace('EDGE_HTTP_PORT=80', 'EDGE_HTTP_PORT=8080')
t = t.replace('EDGE_HTTPS_PORT=443', 'EDGE_HTTPS_PORT=8443')
t = t.replace('ORYX_IMAGE_TAG=2026.10.18', 'ORYX_IMAGE_TAG=exec09')
dst.write_text(t)
print('CHANGE_ME remaining:', t.count('CHANGE_ME'))
