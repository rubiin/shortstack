import { describe, expect, it } from 'vitest'

import {
  classifyDevice,
  coarseCountry,
  countryName,
  deviceLabel,
  percentage,
  referrerDomain,
} from '../../src/domain/privacy'

describe('classifyDevice', () => {
  it('classifies common devices roughly, without keeping the user agent', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile')).toBe(
      'mobile',
    )
    expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('tablet')
    expect(classifyDevice('Mozilla/5.0 (Android 15; Mobile; rv:130.0)')).toBe('mobile')
    expect(classifyDevice('Mozilla/5.0 (Android 15; Tablet; rv:130.0)')).toBe('tablet')
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('desktop')
    expect(classifyDevice(null)).toBe('unknown')
    expect(classifyDevice('')).toBe('unknown')
  })

  it('classifies previews and crawlers as automated', () => {
    expect(classifyDevice('Slackbot-LinkExpanding 1.0')).toBe('bot')
    expect(classifyDevice('facebookexternalhit/1.1')).toBe('bot')
    expect(classifyDevice('curl/8.0')).toBe('bot')
  })
})

describe('coarseCountry', () => {
  it('keeps only a two-letter code and falls back to unknown', () => {
    expect(coarseCountry('us')).toBe('US')
    expect(coarseCountry(' DE ')).toBe('DE')
    expect(coarseCountry('USA')).toBe('ZZ')
    expect(coarseCountry('XX')).toBe('ZZ')
    expect(coarseCountry(null)).toBe('ZZ')
  })
})

describe('referrerDomain', () => {
  it('keeps only the registrable-ish host and strips www', () => {
    expect(referrerDomain('https://www.linkedin.com/feed/?token=secret')).toBe('linkedin.com')
    expect(referrerDomain('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com')
    expect(referrerDomain('https://example.com:8443/path')).toBe('example.com')
  })

  it('does not store local file, invalid, or single-label referrers', () => {
    expect(referrerDomain(null)).toBe('direct')
    expect(referrerDomain('file:///home/user/secret')).toBe('direct')
    expect(referrerDomain('not a url')).toBe('direct')
    expect(referrerDomain('http://localhost:3000/secret')).toBe('direct')
  })
})

describe('presentation helpers', () => {
  it('labels devices and countries', () => {
    expect(deviceLabel('mobile')).toBe('Mobile')
    expect(deviceLabel('bot')).toBe('Automated')
    expect(deviceLabel('unknown')).toBe('Unknown')
    expect(countryName('US')).toBe('United States')
    expect(countryName('ZZ')).toBe('Unknown')
    expect(countryName('QQ')).toBe('QQ')
  })

  it('rounds shares without dividing by zero', () => {
    expect(percentage(1, 3)).toBe(33)
    expect(percentage(2, 3)).toBe(67)
    expect(percentage(0, 0)).toBe(0)
  })
})
