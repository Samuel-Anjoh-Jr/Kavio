import { sendTwilioMessage, toWhatsappAddress } from './twilio.util';

describe('sendTwilioMessage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const credentials = { accountSid: 'AC-test', authToken: 'token' };

  it('posts to the Messages endpoint with Basic auth and form-encoded fields', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ sid: 'SM-1' }), { status: 201 }));

    await sendTwilioMessage(credentials, {
      to: '+237655555555',
      from: '+15017122661',
      body: '123456 is your Kavio code.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC-test/Messages.json');

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('AC-test:token').toString('base64')}`);

    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('To')).toBe('+237655555555');
    expect(body.get('From')).toBe('+15017122661');
    expect(body.get('Body')).toBe('123456 is your Kavio code.');
  });

  it("throws with Twilio's error detail when the response is not ok", async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"message":"Invalid From number"}', { status: 400 }));

    await expect(
      sendTwilioMessage(credentials, { to: '+237655555555', from: 'bad', body: 'hi' }),
    ).rejects.toThrow(/Twilio responded 400/);
  });

  it('reports a timeout distinctly from a generic network error', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    await expect(
      sendTwilioMessage(credentials, { to: '+237655555555', from: '+15017122661', body: 'hi' }),
    ).rejects.toThrow(/timed out/);
  });
});

describe('toWhatsappAddress', () => {
  it('adds the whatsapp: prefix Twilio requires', () => {
    expect(toWhatsappAddress('+237655555555')).toBe('whatsapp:+237655555555');
  });

  it('leaves an already-prefixed address untouched', () => {
    expect(toWhatsappAddress('whatsapp:+237655555555')).toBe('whatsapp:+237655555555');
  });
});
