#!/usr/bin/env bash
#
# The branch migration and its access rules, tested in a THROWAWAY Postgres.
#
#   npm run test:branches
#
# Why not the other test:* scripts? Those talk to a live Supabase project through
# its API. This one needs to (a) load the repo's migrations, (b) fill the database
# with data the way it looked BEFORE branches, (c) apply the branch migration on top
# and prove nothing changed, and (d) act as real database roles. None of that is
# something to do to a project you care about, so it runs in a disposable container.
#
# Needs Docker and the Supabase Postgres image (set SUPABASE_POSTGRES_IMAGE to use a
# different tag). Nothing outside the container is touched.
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE="${SUPABASE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.166}"
NAME="salon-branch-test-$$"
BRANCH_MIGRATION="20261021000046_branches.sql"
TESTS="supabase/tests/branches"

psql_admin() { docker exec -i "$NAME" psql -U supabase_admin -d postgres -h 127.0.0.1 "$@"; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting a throwaway database ($IMAGE)..."
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done

psql_admin -v ON_ERROR_STOP=1 -q -f - < "$TESTS/00-local-stubs.sql"

echo "Applying the migrations that existed before branches..."
for f in $(ls supabase/migrations/*.sql | sort); do
  name="$(basename "$f")"
  if [[ "$name" == "$BRANCH_MIGRATION" ]]; then break; fi
  if ! out=$(psql_admin -v ON_ERROR_STOP=1 -q -f - < "$f" 2>&1); then
    echo "FAILED: $name"; echo "$out" | head -8; exit 1
  fi
done

echo "Filling it with data as it exists before branches..."
psql_admin -v ON_ERROR_STOP=1 -q -f - < "$TESTS/01-seed-existing-data.sql" >/dev/null

echo "Applying the branch migration to that data..."
psql_admin -v ON_ERROR_STOP=1 -q -f - < "supabase/migrations/$BRANCH_MIGRATION"

echo; echo "Was anything lost or changed?"
psql_admin -f - < "$TESTS/02-compare-existing-data.sql" | sed -n '/before_rows/,$p'
if psql_admin -Atc "select count(*) from qa.snap_before b join qa.snap_after a using (t) where b.n <> a.n or b.d <> a.d" | grep -qv '^0$'; then
  echo "FAIL: existing data changed"; exit 1
fi

echo; echo "Access-control tests..."
psql_admin -v ON_ERROR_STOP=1 -q -f - < "$TESTS/03-access-tests.sql" | grep -E "FAIL|passed|ERROR" || true
read -r passed failed < <(psql_admin -Atc "select count(*) filter (where ok), count(*) filter (where not ok) from qa.res" | tr '|' ' ')
echo "${passed} passed, ${failed} failed"
[[ "$failed" == "0" ]]
