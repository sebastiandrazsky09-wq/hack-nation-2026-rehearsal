import { describe, expect, it } from 'vitest';
import { curlFor, safeHref } from '../../../src/components/gate-client';

describe('safeHref: a stored source address becomes a link only if it is http or https', () => {
  it.each(['https://example.test/a', 'http://example.test/a', 'HTTPS://EXAMPLE.TEST'])('%s is a link', url => { expect(safeHref(url)).toBe(url); });
  it.each(['javascript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '//example.test/a', 'example.test', '', null, undefined])('%s is not a link', url => {
    expect(safeHref(url as string | null | undefined)).toBeNull();
  });
});

describe('curlFor', () => {
  it('prints the body as the JSON that is sent', () => {
    const body = { subject: { type: 'owner' }, resource: { type: 'property', id: 'X' } };
    const curl = curlFor('http://127.0.0.1:3000', '/api/v1/check', body);
    expect(curl).toContain("-d '" + JSON.stringify(body) + "'");
    expect(curl).toContain('http://127.0.0.1:3000/api/v1/check');
  });
});
