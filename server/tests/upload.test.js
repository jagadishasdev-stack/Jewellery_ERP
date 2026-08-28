/**
 * server/src/routes/upload.js — image upload/delete for Invoice Studio
 * assets (logo/stamp/signature/etc). 2 endpoints, previously zero coverage.
 *
 * FIXED as part of this pass — a real path-traversal vulnerability: unlike
 * the upload destination (which whitelists `type` against a fixed list),
 * DELETE /image passed `type` straight into path.join() unchecked. Any
 * authenticated user could pass a `type` like '../../../../etc' and
 * path.join would walk right out of the uploads directory, letting them
 * delete arbitrary files the Node process has permission to remove.
 * path.basename(filename) alone never protected against this — `type` is a
 * separate, unsanitized path segment. Fixed by applying the same whitelist
 * used for uploads to deletes too.
 */
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const { getUploadsRoot } = require('../src/utils/uploadsDir');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

// A minimal valid 1x1 PNG, so multer's own file-content isn't the thing
// under test — the extension-based fileFilter is.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bf6f0000000049454e44ae426082',
  'hex'
);

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

describe('POST /api/upload/image', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/api/upload/image').attach('file', TINY_PNG, 'logo.png');
    expect(res.status).toBe(401);
  });

  test('400 with no file attached', async () => {
    const res = await request(app).post('/api/upload/image').set(auth());
    expect(res.status).toBe(400);
  });

  /**
   * FIXED: multer's fileFilter rejects a bad extension via `cb(err, false)`,
   * which skips the route handler entirely and used to fall through to the
   * app's generic error handler — a flat 500 "An unexpected error
   * occurred.", discarding fileFilter's own actually-useful message. Now
   * caught explicitly and reported as a clean 400 with the real reason.
   */
  test('FIXED: rejects a non-image extension with a clean 400 and the real reason (used to be a generic 500)', async () => {
    const res = await request(app).post('/api/upload/image').set(auth())
      .attach('file', Buffer.from('not an image'), 'malware.exe');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only image files allowed/);
  });

  test('uploads to the default "logos" folder when no ?type= is given, and the file really exists on disk', async () => {
    const res = await request(app).post('/api/upload/image').set(auth()).attach('file', TINY_PNG, 'logo.png');
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('logos');
    expect(res.body.data.url).toBe(`/uploads/logos/${res.body.data.filename}`);
    expect(res.body.data.filename).toMatch(new RegExp(`^${tenant.tenantId}_\\d+\\.png$`));

    const onDisk = path.join(getUploadsRoot(), 'logos', res.body.data.filename);
    expect(fs.existsSync(onDisk)).toBe(true);
    fs.unlinkSync(onDisk);
  });

  test('uploads to an explicit, whitelisted ?type=stamps folder', async () => {
    const res = await request(app).post('/api/upload/image?type=stamps').set(auth()).attach('file', TINY_PNG, 'stamp.png');
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('stamps');

    const onDisk = path.join(getUploadsRoot(), 'stamps', res.body.data.filename);
    expect(fs.existsSync(onDisk)).toBe(true);
    fs.unlinkSync(onDisk);
  });

  test('an unrecognized ?type= silently falls back to "logos" rather than writing outside the known folders', async () => {
    const res = await request(app).post('/api/upload/image?type=../../etc').set(auth()).attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('../../etc'); // echoed back as-is in the response...
    const onDisk = path.join(getUploadsRoot(), 'logos', res.body.data.filename);
    expect(fs.existsSync(onDisk)).toBe(true); // ...but the file itself landed safely in logos/
    fs.unlinkSync(onDisk);
  });
});

describe('DELETE /api/upload/image', () => {
  let uploadedFilename;

  beforeAll(async () => {
    const res = await request(app).post('/api/upload/image').set(auth()).attach('file', TINY_PNG, 'delete-me.png');
    uploadedFilename = res.body.data.filename;
  });

  test('requires auth', async () => {
    const res = await request(app).delete('/api/upload/image').send({ filename: uploadedFilename });
    expect(res.status).toBe(401);
  });

  test('400 with no filename', async () => {
    const res = await request(app).delete('/api/upload/image').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  /**
   * FIXED: see file header. Before the fix, `type` went straight into
   * path.join() with no validation, so this exact call would have tried to
   * delete a file relative to a path several directories above the uploads
   * root. Now it's refused outright.
   */
  test('FIXED: an unrecognized/traversal type is refused with 400, not used to build a path', async () => {
    const res = await request(app).delete('/api/upload/image').set(auth())
      .send({ filename: uploadedFilename, type: '../../../../../etc' });
    expect(res.status).toBe(400);

    // The file must still exist — the traversal attempt must not have
    // reached (or deleted) anything, inside or outside the uploads dir.
    const onDisk = path.join(getUploadsRoot(), 'logos', uploadedFilename);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  test('deletes a real uploaded file from the correct (whitelisted) folder', async () => {
    const onDiskBefore = path.join(getUploadsRoot(), 'logos', uploadedFilename);
    expect(fs.existsSync(onDiskBefore)).toBe(true);

    const res = await request(app).delete('/api/upload/image').set(auth()).send({ filename: uploadedFilename, type: 'logos' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(onDiskBefore)).toBe(false);
  });

  test('deleting an already-gone (or never-existed) file is still a clean success, not an error', async () => {
    const res = await request(app).delete('/api/upload/image').set(auth()).send({ filename: 'no-such-file-ever.png', type: 'logos' });
    expect(res.status).toBe(200);
  });
});
