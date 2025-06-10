import PQueue from 'p-queue';

/**
 * RateLimiter - Manages request rate limiting to respect server resources
 * Uses a token bucket algorithm with configurable rates
 */
export class RateLimiter {
  private queue: PQueue;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(
    private maxRequestsPerMinute: number = 30,
    private maxConcurrency: number = 2,
    private minDelayBetweenRequests: number = 1000 // 1 second minimum delay
  ) {
    this.queue = new PQueue({
      concurrency: maxConcurrency,
      interval: 60000, // 1 minute
      intervalCap: maxRequestsPerMinute
    });
  }

  /**
   * Execute a function with rate limiting
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    return await this.queue.add(async () => {
      // Ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minDelayBetweenRequests) {
        const delayNeeded = this.minDelayBetweenRequests - timeSinceLastRequest;
        await this.delay(delayNeeded);
      }

      // Track request timing
      this.lastRequestTime = Date.now();
      this.requestCount++;

      // Log rate limit status
      this.logRateLimitStatus();

      try {
        return await fn();
      } catch (error) {
        console.error('Error during rate-limited execution:', error);
        throw error;
      }
    }) as Promise<T>;
  }

  /**
   * Add delay between requests
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log current rate limit status
   */
  private logRateLimitStatus(): void {
    const now = Date.now();
    const windowElapsed = now - this.windowStart;
    
    // Reset window if needed
    if (windowElapsed >= 60000) {
      this.windowStart = now;
      this.requestCount = 1;
    }

    const requestsInWindow = this.requestCount;
    const remainingRequests = this.maxRequestsPerMinute - requestsInWindow;
    
    console.log(`Rate limit status: ${requestsInWindow}/${this.maxRequestsPerMinute} requests used, ${remainingRequests} remaining`);
  }

  /**
   * Get current queue statistics
   */
  public getStats() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      isPaused: this.queue.isPaused,
      requestCount: this.requestCount,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      maxConcurrency: this.maxConcurrency
    };
  }

  /**
   * Pause the queue
   */
  public pause(): void {
    this.queue.pause();
    console.log('Rate limiter paused');
  }

  /**
   * Resume the queue
   */
  public start(): void {
    this.queue.start();
    console.log('Rate limiter resumed');
  }

  /**
   * Clear all pending requests
   */
  public clear(): void {
    this.queue.clear();
    console.log('Rate limiter queue cleared');
  }

  /**
   * Wait for all pending requests to complete
   */
  public async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  /**
   * Create a rate limiter specifically for Apple's servers
   * Apple's robots.txt suggests being respectful, so we use conservative limits
   */
  public static createAppleRateLimiter(): RateLimiter {
    return new RateLimiter(
      30,   // 30 requests per minute (0.5 requests per second)
      2,    // Max 2 concurrent requests
      2000  // 2 second minimum delay between requests
    );
  }
}

/**
 * Exponential backoff utility for handling retries
 */
export class ExponentialBackoff {
  constructor(
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
    private factor: number = 2
  ) {}

  /**
   * Calculate delay for a given retry attempt
   */
  public getDelay(attempt: number): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(this.factor, attempt),
      this.maxDelay
    );
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Execute a function with exponential backoff retry
   */
  public async execute<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    shouldRetry: (error: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && shouldRetry(error)) {
          const delay = this.getDelay(attempt);
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
    
    throw lastError;
  }
}