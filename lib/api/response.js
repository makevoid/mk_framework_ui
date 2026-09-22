export class ApiError extends Error {
  constructor(message, { status = 0, data = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiResponse {
  constructor(response) {
    this.response = response;
  }

  async read() {
    const body = await this.response.text();
    const data = body ? this.parse(body) : null;
    if (!this.response.ok) {
      const status = this.response.status;
      const message = data?.error || data?.message || `Request failed (${status})`;
      throw new ApiError(message, { status, data });
    }
    return data;
  }

  parse(body) {
    try {
      return JSON.parse(body);
    } catch {
      throw new ApiError('The API returned a non-JSON response.', { status: this.response.status });
    }
  }
}
