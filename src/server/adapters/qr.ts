import QRCode from 'qrcode'

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#17221d', light: '#ffffff' },
  })
}

export async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 1024,
    color: { dark: '#17221d', light: '#ffffff' },
  })
}
