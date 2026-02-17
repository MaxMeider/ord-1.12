const cds = require("@sap/cds");
const ord = require("./ord.js");
const getMetadata = require("./metaData.js");
const defaults = require("./defaults.js");
const { createAuthConfig, createAuthMiddleware } = require("./auth/authentication.js");
const Logger = require("./logger.js");

class OpenResourceDiscoveryService extends cds.ApplicationService {
    async init() {
        // Initialize authentication configuration from .cdsrc.json or environment variables
        // CF mTLS validator is lazily initialized on first mTLS request
        const authConfig = createAuthConfig();
        if (authConfig.error) {
            throw new Error(`Authentication initialization failed: ${authConfig.error}`);
        }

        // Create authentication middleware
        const authMiddleware = createAuthMiddleware(authConfig);

        cds.app.get(`${this.path}`, (_, res) => {
            return res.status(200).send(defaults.baseTemplate(authConfig));
        });

        cds.app.get(`/open-resource-discovery/v1/documents/system-version`, authMiddleware, async (_, res) => {
            const csn = cds.context?.model || cds.model;
            const data = ord(csn);
            return res.status(200).send(data);
        });

        cds.app.get(`/open-resource-discovery/v1/documents/:id`, authMiddleware, async (_, res) => {
            return res.status(404).send("404 Not Found");
        });

        // Handler for metadata requests (oas3, edmx, csn, etc.)
        const metadataHandler = async (req, res) => {
            try {
                const { contentType, response } = await getMetadata(req.url);
                return res.status(200).contentType(contentType).send(response);
            } catch (error) {
                Logger.error(error, "Error while processing the resource definition document");
                return res.status(500).send(error.message);
            }
        };

        // Use wildcard routes to handle URLs with colons in path segments (e.g., ordIds like "namespace:apiResource:name:v1")
        // The wildcard (*) captures everything after the base path, avoiding issues with Express interpreting colons as route parameters
        cds.app.get(`/open-resource-discovery/v1/*`, authMiddleware, metadataHandler);
        cds.app.get(`/open-resource-discovery/v1`, authMiddleware, metadataHandler);

        // Also serve on /ord/v1/ path for compatibility with ORD document URLs
        cds.app.get(`/ord/v1/*`, authMiddleware, metadataHandler);
        cds.app.get(`/ord/v1`, authMiddleware, metadataHandler);

        return super.init();
    }
}

module.exports = { OpenResourceDiscoveryService };
