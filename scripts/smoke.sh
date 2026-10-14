set -u
BASE=http://localhost:3001/api/v1
echo "== health =="; curl -s http://localhost:3001/api/health; echo
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@oryx.local","password":"ChangeMe!Oryx2026"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).accessToken))")
echo "== me =="; curl -s $BASE/auth/me -H "Authorization: Bearer $TOKEN" | head -c 500; echo
echo "== context =="; curl -s $BASE/auth/context -H "Authorization: Bearer $TOKEN" | head -c 400; echo
echo "== dashboard platform-all =="; curl -s "$BASE/dashboard" -H "Authorization: Bearer $TOKEN" | head -c 900; echo
echo "== companies =="; curl -s "$BASE/companies?pageSize=2" -H "Authorization: Bearer $TOKEN" | head -c 900; echo
echo "== plans =="; curl -s "$BASE/plans" -H "Authorization: Bearer $TOKEN" | head -c 500; echo
echo "== modules =="; curl -s "$BASE/modules" -H "Authorization: Bearer $TOKEN" | head -c 400; echo
echo "== audit =="; curl -s "$BASE/audit-logs?pageSize=2" -H "Authorization: Bearer $TOKEN" | head -c 500; echo
echo "== cms pages =="; curl -s "$BASE/cms/pages" -H "Authorization: Bearer $TOKEN" | head -c 300; echo
echo "== public content =="; curl -s "$BASE/cms/public/content?locale=en" | head -c 300; echo
