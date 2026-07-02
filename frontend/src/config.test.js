import { describe, expect, it } from 'vitest'

import { API_BASE_URL } from './config'

describe('frontend smoke', () => {
  it('has an API base URL fallback', () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\//)
  })
})
