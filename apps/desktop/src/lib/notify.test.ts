import { describe, expect, it } from 'vitest';
import { notificationBody, plainText, showNotification } from './notify';

describe('plainText', () => {
  it('drops emphasis, code and heading markers', () => {
    expect(plainText('# Titre\n\nUn texte **gras**, _italique_ et `code`.')).toBe(
      'Titre Un texte gras, italique et code.',
    );
  });

  it('keeps the label of links and the alt text of images', () => {
    expect(plainText('Voir [la doc](https://example.com) ![logo](https://example.com/a.png)')).toBe(
      'Voir la doc logo',
    );
  });

  it('removes list and quote markers and code fences', () => {
    expect(plainText('> cité\n- un\n- deux\n1. trois\n```js\nlet x = 1;\n```')).toBe(
      'cité un deux trois let x = 1;',
    );
  });

  it('collapses line breaks and extra spaces', () => {
    expect(plainText('  a \n\n  b\t c  ')).toBe('a b c');
  });
});

describe('notificationBody', () => {
  it('keeps a short message whole', () => {
    expect(notificationBody('Bonjour **tout le monde**')).toBe('Bonjour tout le monde');
  });

  it('cuts a long message with an ellipsis, within the limit', () => {
    const body = notificationBody('mot '.repeat(100), 40);
    expect(body.length).toBeLessThanOrEqual(40);
    expect(body.endsWith('…')).toBe(true);
  });
});

describe('showNotification', () => {
  it('does nothing outside the Tauri shell, and does not throw', async () => {
    await expect(showNotification('titre', 'texte')).resolves.toBeUndefined();
  });
});
