const Logger = require('./Logger');
const axios = require('axios');

class ServiceMonitor {
  constructor() {
    this.services = new Map();
    this.checkInterval = 30000; // 30 seconds
    this.monitorTimer = null;
  }

  /**
   * Register a service to monitor
   * @param {string} name - Service name
   * @param {Object} config - Service configuration
   */
  register(name, config) {
    this.services.set(name, {
      name,
      url: config.url,
      isHealthy: true,
      lastCheck: null,
      consecutiveFailures: 0,
      onRecover: config.onRecover || (() => {}),
      onFail: config.onFail || (() => {})
    });
  }

  /**
   * Start monitoring services
   */
  start() {
    if (this.monitorTimer) return;
    
    Logger.info('Starting service monitor');
    this.checkServices();
    this.monitorTimer = setInterval(() => this.checkServices(), this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      Logger.info('Service monitor stopped');
    }
  }

  /**
   * Check all registered services
   */
  async checkServices() {
    for (const [name, service] of this.services) {
      try {
        const response = await axios.get(service.url, {
          timeout: 5000,
          validateStatus: () => true
        });

        const isHealthy = response.status === 200;
        const wasHealthy = service.isHealthy;

        service.isHealthy = isHealthy;
        service.lastCheck = new Date();

        if (isHealthy) {
          if (!wasHealthy && service.consecutiveFailures > 0) {
            // Service recovered
            Logger.info(`Service ${name} recovered after ${service.consecutiveFailures} failures`);
            service.onRecover();
          }
          service.consecutiveFailures = 0;
        } else {
          service.consecutiveFailures++;
          Logger.warn(`Service ${name} unhealthy (attempt ${service.consecutiveFailures})`);
          
          if (wasHealthy) {
            // Service just went down
            service.onFail();
          }
        }
      } catch (error) {
        const wasHealthy = service.isHealthy;
        service.isHealthy = false;
        service.consecutiveFailures++;
        service.lastCheck = new Date();

        Logger.error(`Service ${name} check failed:`, {
          error: error.message,
          failures: service.consecutiveFailures
        });

        if (wasHealthy) {
          service.onFail();
        }
      }
    }
  }

  /**
   * Get service status
   * @param {string} name - Service name
   * @returns {Object} Service status
   */
  getStatus(name) {
    const service = this.services.get(name);
    if (!service) return null;

    return {
      name: service.name,
      isHealthy: service.isHealthy,
      lastCheck: service.lastCheck,
      consecutiveFailures: service.consecutiveFailures
    };
  }

  /**
   * Get all services status
   * @returns {Object} All services status
   */
  getAllStatus() {
    const status = {};
    for (const [name, service] of this.services) {
      status[name] = {
        isHealthy: service.isHealthy,
        lastCheck: service.lastCheck,
        consecutiveFailures: service.consecutiveFailures
      };
    }
    return status;
  }
}

module.exports = new ServiceMonitor();