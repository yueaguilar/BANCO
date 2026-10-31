const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/database');
const requireRole = require('../src/middleware/requireRole');

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('requires a recognized role and rejects invalid policies', () => {
    assert.throws(() => requireRole(), /recognized roles/);
    assert.throws(() => requireRole('owner'), /recognized roles/);
});

test('authorizes based on the current database role, not token claims', async (t) => {
    const originalQuery = pool.query;
    t.after(() => {
        pool.query = originalQuery;
    });

    let role = 'customer';
    pool.query = async (_sql, params) => {
        assert.deepEqual(params, [42]);
        return { rows: [{ role }] };
    };

    const middleware = requireRole('admin');
    const req = { user: { id: 42, role: 'admin' } };
    let nextCalls = 0;
    let res = response();
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalls, 0);

    role = 'admin';
    res = response();
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 200);
    assert.equal(req.user.role, 'admin');
    assert.equal(nextCalls, 1);
});

test('fails closed when the role lookup is unavailable', async (t) => {
    const originalQuery = pool.query;
    t.after(() => {
        pool.query = originalQuery;
    });
    pool.query = async () => {
        throw new Error('database unavailable');
    };

    const res = response();
    await requireRole('admin')({ user: { id: 42 } }, res, () => {
        assert.fail('authorization must not continue');
    });
    assert.equal(res.statusCode, 503);
});
