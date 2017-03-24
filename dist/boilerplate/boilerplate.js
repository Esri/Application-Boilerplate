define(["require", "exports", "dojo/text!config/demoWebMap.json", "dojo/text!config/demoWebScene.json", "dojo/_base/kernel", "dojo/_base/lang", "esri/config", "esri/core/promiseUtils", "esri/identity/IdentityManager", "esri/identity/OAuthInfo", "esri/portal/Portal", "esri/portal/PortalItem", "esri/portal/PortalQueryParams"], function (require, exports, webmapText, websceneText, kernel, lang, esriConfig, promiseUtils, IdentityManager, OAuthInfo, Portal, PortalItem, PortalQueryParams) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /// <amd-dependency path='dojo/text!config/demoWebMap.json' name='webmapText' />
    /// <amd-dependency path='dojo/text!config/demoWebScene.json' name='websceneText' />
    var TAGS_RE = /<\/?[^>]+>/g;
    var URL_RE = /([^&=]+)=?([^&]*)(?:&+|$)/g;
    var SHARING_PATH = "/sharing";
    var ESRI_PROXY_PATH = "/sharing/proxy";
    var ESRI_APPS_PATH = "/apps/";
    var ESRI_HOME_PATH = "/home/";
    var RTL_LANGS = ["ar", "he"];
    var LTR = "ltr";
    var RTL = "rtl";
    var LOCALSTORAGE_PREFIX = "boilerplate_config_";
    var DEFAULT_URL_PARAM = "default";
    var Boilerplate = (function () {
        function Boilerplate(applicationConfigJSON, boilerplateSettings) {
            this.settings = null;
            this.config = null;
            this.results = null;
            this.portal = null;
            this.direction = null;
            this.locale = null;
            this.units = null;
            this.userPrivileges = null;
            this.settings = lang.mixin({
                webscene: {},
                webmap: {},
                group: {},
                portal: {},
                urlItems: []
            }, boilerplateSettings);
            this.config = applicationConfigJSON;
            this.results = {};
        }
        Boilerplate.prototype.queryGroupItems = function () {
            var _this = this;
            // Get details about the specified web scene. If the web scene is not shared publicly users will
            // be prompted to log-in by the Identity Manager.
            if (!this.settings.group.fetchItems || !this.config.group) {
                return promiseUtils.resolve();
            }
            var defaultParams = {
                query: "group:\"" + this.config.group + "\" AND -type:\"Code Attachment\"",
                sortField: "modified",
                sortOrder: "desc",
                num: 9,
                start: 1
            };
            //Object.assign(defaultParams, this.settings.group.itemParams);
            var paramOptions = lang.mixin(defaultParams, this.settings.group.itemParams);
            // group params
            var params = new PortalQueryParams(paramOptions);
            return this.portal.queryItems(params).then(function (response) {
                if (!_this.results.group) {
                    _this.results.group = {};
                }
                _this.results.group.itemsData = response;
                return _this.results.group;
            }).otherwise(function (error) {
                if (!error) {
                    error = new Error("Boilerplate:: Error retrieving group items.");
                }
                if (!_this.results.group) {
                    _this.results.group = {};
                }
                _this.results.group.itemsData = error;
                return error;
            });
        };
        Boilerplate.prototype.init = function () {
            var _this = this;
            // Set the web scene and appid if they exist but ignore other url params.
            // Additional url parameters may be defined by the application but they need to be mixed in
            // to the config object after we retrieve the application configuration info. As an example,
            // we'll mix in some commonly used url parameters after
            // the application configuration has been applied so that the url parameters overwrite any
            // configured settings. It's up to the application developer to update the application to take
            // advantage of these parameters.
            // This demonstrates how to handle additional custom url parameters. For example
            // if you want users to be able to specify lat/lon coordinates that define the map's center or
            // specify an alternate basemap via a url parameter.
            // If these options are also configurable these updates need to be added after any
            // application default and configuration info has been applied. Currently these values
            // (center, basemap, theme) are only here as examples and can be removed if you don't plan on
            // supporting additional url parameters in your application.
            this.results.urlParams = {
                config: this._getUrlParamValues(this.settings.urlItems)
            };
            // config defaults <- standard url params
            // we need the web scene, appid,and oauthappid to query for the data
            this._mixinAllConfigs();
            // Define the portalUrl and other default values like the proxy.
            // The portalUrl defines where to search for the web map and application content. The
            // default value is arcgis.com.
            this._initializeApplication();
            // determine boilerplate language properties
            this._setLangProps();
            // check if signed in. Once we know if we're signed in, we can get data and create a portal if needed.
            return this._checkSignIn().always(function () {
                // execute these tasks async
                return promiseUtils.eachAlways([
                    // get application data
                    _this._queryApplicationItem(),
                    // get org data
                    _this._queryPortal()
                ]).always(function () {
                    // gets a temporary config from the users local storage
                    _this.results.localStorageConfig = _this._getLocalConfig();
                    // mixin all new settings from org and app
                    _this._mixinAllConfigs();
                    // let's set up a few things
                    _this._completeApplication();
                    // then execute these async
                    return promiseUtils.eachAlways([
                        // webmap item
                        _this._queryWebMapItem(),
                        // webscene item
                        _this._queryWebSceneItem(),
                        // group information
                        _this._queryGroupInfo(),
                        // items within a specific group
                        _this.queryGroupItems()
                    ]).always(function () {
                        return {
                            settings: _this.settings,
                            config: _this.config,
                            results: _this.results,
                            portal: _this.portal,
                            direction: _this.direction,
                            locale: _this.locale,
                            units: _this.units,
                            userPrivileges: _this.userPrivileges
                        };
                    });
                });
            });
        };
        Boilerplate.prototype._getLocalConfig = function () {
            var appid = this.config.appid;
            if (window.localStorage && appid && this.settings.localConfig.fetch) {
                var lsItem = localStorage.getItem(LOCALSTORAGE_PREFIX + appid);
                if (lsItem) {
                    var config = JSON.parse(lsItem);
                    if (config) {
                        return config;
                    }
                }
            }
        };
        Boilerplate.prototype._queryWebMapItem = function () {
            var _this = this;
            // Get details about the specified web map. If the web map is not shared publicly users will
            // be prompted to log-in by the Identity Manager.
            if (!this.settings.webmap.fetch) {
                return promiseUtils.resolve();
            }
            // Use local web map instead of portal web map
            if (this.settings.webmap.useLocal) {
                var json = JSON.parse(webmapText);
                this.results.webMapItem = {
                    json: json
                };
                return promiseUtils.resolve(this.results.webMapItem);
            }
            else if (this.config.webmap) {
                var mapItem = new PortalItem({
                    id: this.config.webmap
                }).load();
                return mapItem.then(function (itemData) {
                    _this.results.webMapItem = {
                        data: itemData
                    };
                    return _this.results.webMapItem;
                }).otherwise(function (error) {
                    if (!error) {
                        error = new Error("Boilerplate:: Error retrieving webmap item.");
                    }
                    _this.results.webMapItem = {
                        data: error
                    };
                    return error;
                });
            }
            else {
                return promiseUtils.resolve();
            }
        };
        Boilerplate.prototype._queryGroupInfo = function () {
            var _this = this;
            // Get details about the specified group. If the group is not shared publicly users will
            // be prompted to log-in by the Identity Manager.
            if (!this.settings.group.fetchInfo || !this.config.group) {
                return promiseUtils.resolve();
            }
            // group params
            var params = new PortalQueryParams({
                query: "id:\"" + this.config.group + "\""
            });
            return this.portal.queryGroups(params).then(function (response) {
                if (!_this.results.group) {
                    _this.results.group = {};
                }
                _this.results.group.infoData = response;
                return _this.results.group;
            }).otherwise(function (error) {
                if (!error) {
                    error = new Error("Boilerplate:: Error retrieving group info.");
                }
                if (!_this.results.group) {
                    _this.results.group = {};
                }
                _this.results.group.infoData = error;
                return error;
            });
        };
        Boilerplate.prototype._queryWebSceneItem = function () {
            var _this = this;
            var sceneItem;
            // Get details about the specified web scene. If the web scene is not shared publicly users will
            // be prompted to log-in by the Identity Manager.
            if (!this.settings.webscene.fetch) {
                return promiseUtils.resolve();
            }
            // Use local web scene instead of portal web scene
            if (this.settings.webscene.useLocal) {
                // get web scene js file
                var json = JSON.parse(websceneText);
                this.results.webSceneItem = {
                    json: json
                };
                return promiseUtils.resolve(this.results.webSceneItem);
            }
            else if (this.config.webscene) {
                sceneItem = new PortalItem({
                    id: this.config.webscene
                }).load();
                return sceneItem.then(function (itemData) {
                    _this.results.webSceneItem = {
                        data: itemData
                    };
                    return _this.results.webSceneItem;
                }).otherwise(function (error) {
                    if (!error) {
                        error = new Error("Boilerplate:: Error retrieving webscene item.");
                    }
                    _this.results.webSceneItem = {
                        data: error
                    };
                    return error;
                });
            }
            else {
                return promiseUtils.resolve();
            }
        };
        Boilerplate.prototype._queryApplicationItem = function () {
            var _this = this;
            // Get the application configuration details using the application id. When the response contains
            // itemData.values then we know the app contains configuration information. We'll use these values
            // to overwrite the application defaults.
            if (!this.config.appid) {
                return promiseUtils.resolve();
            }
            var appItem = new PortalItem({
                id: this.config.appid
            }).load();
            return appItem.then(function (itemData) {
                return itemData.fetchData().then(function (data) {
                    var cfg = {};
                    if (data && data.values) {
                        // get app config values - we'll merge them with config later.
                        cfg = data.values;
                    }
                    // get the extent for the application item. This can be used to override the default web map extent
                    if (itemData.extent) {
                        cfg.application_extent = itemData.extent;
                    }
                    // get any app proxies defined on the application item
                    if (itemData.appProxies) {
                        var layerMixins = itemData.appProxies.map(function (p) {
                            return {
                                "url": p.sourceUrl,
                                "mixin": {
                                    "url": p.proxyUrl
                                }
                            };
                        });
                        cfg.layerMixins = layerMixins;
                    }
                    _this.results.applicationItem = {
                        data: itemData,
                        config: cfg
                    };
                    return _this.results.applicationItem;
                }).otherwise(function (error) {
                    if (!error) {
                        error = new Error("Boilerplate:: Error retrieving application configuration data.");
                    }
                    _this.results.applicationItem = {
                        data: error,
                        config: null
                    };
                    return error;
                });
            }).otherwise(function (error) {
                if (!error) {
                    error = new Error("Boilerplate:: Error retrieving application configuration.");
                }
                _this.results.applicationItem = {
                    data: error,
                    config: null
                };
                return error;
            });
        };
        Boilerplate.prototype._queryPortal = function () {
            var _this = this;
            if (!this.settings.portal.fetch) {
                return promiseUtils.resolve();
            }
            // Query the ArcGIS.com organization. This is defined by the portalUrl that is specified. For example if you
            // are a member of an org you'll want to set the portalUrl to be http://<your org name>.arcgis.com. We query
            // the organization by making a self request to the org url which returns details specific to that organization.
            // Examples of the type of information returned are custom roles, units settings, helper services and more.
            // If this fails, the application will continue to function
            var portal = new Portal().load();
            this.portal = portal;
            return portal.then(function (response) {
                if (_this.settings.webTierSecurity) {
                    var trustedHost = void 0;
                    if (response.authorizedCrossOriginDomains && response.authorizedCrossOriginDomains.length > 0) {
                        for (var i = 0; i < response.authorizedCrossOriginDomains.length; i++) {
                            trustedHost = response.authorizedCrossOriginDomains[i];
                            // add if trusted host is not null, undefined, or empty string
                            if (_this._isDefined(trustedHost) && trustedHost.length > 0) {
                                esriConfig.request.corsEnabledServers.push({
                                    host: trustedHost,
                                    withCredentials: true
                                });
                            }
                        }
                    }
                }
                // set boilerplate units
                var units = "metric";
                if (response.user && response.user.units) {
                    units = response.user.units;
                }
                else if (response.units) {
                    units = response.units;
                }
                else if ((response.user && response.user.region && response.user.region === "US") || (response.user && !response.user.region && response.region === "US") || (response.user && !response.user.region && !response.region) || (!response.user && response.ipCntryCode === "US") || (!response.user && !response.ipCntryCode && kernel.locale === "en-us")) {
                    // use feet/miles only for the US and if nothing is set for a user
                    units = "english";
                }
                _this.units = units;
                // are any custom roles defined in the organization?
                if (response.user && _this._isDefined(response.user.roleId)) {
                    if (response.user.privileges) {
                        _this.userPrivileges = response.user.privileges;
                    }
                }
                // set data for portal on boilerplate
                _this.results.portal = {
                    data: response
                };
                return _this.results.portal;
            }).otherwise(function (error) {
                if (!error) {
                    error = new Error("Boilerplate:: Error retrieving organization information.");
                }
                _this.results.portal = {
                    data: error
                };
                return error;
            });
        };
        Boilerplate.prototype._overwriteExtent = function (itemInfo, extent) {
            var item = itemInfo && itemInfo.item;
            if (item && item.extent) {
                item.extent = [
                    [
                        parseFloat(extent[0][0]), parseFloat(extent[0][1])
                    ],
                    [
                        parseFloat(extent[1][0]), parseFloat(extent[1][1])
                    ]
                ];
            }
        };
        Boilerplate.prototype._completeApplication = function () {
            // ArcGIS.com allows you to set an application extent on the application item. Overwrite the
            // existing extents with the application item extent when set.
            var applicationExtent = this.config.application_extent;
            var results = this.results;
            if (this.config.appid && applicationExtent && applicationExtent.length > 0) {
                this._overwriteExtent(results.webSceneItem.data, applicationExtent);
                this._overwriteExtent(results.webMapItem.data, applicationExtent);
            }
            // get helper services
            var configHelperServices = this.config.helperServices;
            var portalHelperServices = this.portal && this.portal.helperServices;
            // see if config has a geometry service
            var configGeometryUrl = configHelperServices && configHelperServices.geometry && configHelperServices.geometry.url;
            // seee if portal has a geometry service
            var portalGeometryUrl = portalHelperServices && portalHelperServices.geometry && portalHelperServices.geometry.url;
            // use the portal geometry service or config geometry service
            var geometryUrl = portalGeometryUrl || configGeometryUrl;
            if (geometryUrl) {
                // set the esri config to use the geometry service
                esriConfig.geometryServiceUrl = geometryUrl;
            }
            if ((!this.config.webmap || this.config.webmap === DEFAULT_URL_PARAM) && this.settings.defaultWebmap) {
                this.config.webmap = this.settings.defaultWebmap;
            }
            if ((!this.config.webscene || this.config.webscene === DEFAULT_URL_PARAM) && this.settings.defaultWebscene) {
                this.config.webscene = this.settings.defaultWebscene;
            }
            if ((!this.config.group || this.config.group === DEFAULT_URL_PARAM) && this.settings.defaultGroup) {
                this.config.group = this.settings.defaultGroup;
            }
        };
        Boilerplate.prototype._setLangProps = function () {
            var direction = LTR;
            RTL_LANGS.forEach(function (l) {
                if (kernel.locale.indexOf(l) !== -1) {
                    direction = RTL;
                }
            });
            // set boilerplate language direction
            this.direction = direction;
            // set boilerplate langauge locale
            this.locale = kernel.locale;
        };
        Boilerplate.prototype._mixinAllConfigs = function () {
            lang.mixin(this.config, this.results.applicationItem ? this.results.applicationItem.config : null, this.results.localStorageConfig, this.results.urlParams ? this.results.urlParams.config : null);
        };
        Boilerplate.prototype._getUrlParamValues = function (items) {
            // retrieves only the items specified from the URL object.
            // Gets parameters from the URL, convert them to an object and remove HTML tags.
            var urlObject = this._createUrlParamsObject();
            var obj = {};
            if (urlObject && items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    var item = urlObject[items[i]];
                    if (item) {
                        if (typeof item === "string") {
                            switch (item.toLowerCase()) {
                                case "true":
                                    obj[items[i]] = true;
                                    break;
                                case "false":
                                    obj[items[i]] = false;
                                    break;
                                default:
                                    obj[items[i]] = item;
                            }
                        }
                        else {
                            obj[items[i]] = item;
                        }
                    }
                }
            }
            return obj;
        };
        Boilerplate.prototype._createUrlParamsObject = function () {
            // retrieve url parameters. Templates all use url parameters to determine which arcgis.com
            // resource to work with.
            // Scene templates use the webscene param to define the scene to display
            // appid is the id of the application based on the template. We use this
            // id to retrieve application specific configuration information. The configuration
            // information will contain the values the  user selected on the template configuration
            // panel.
            return this._stripObjectTags(this._urlToObject());
        };
        Boilerplate.prototype._initializeApplication = function () {
            // If this app is hosted on an Esri environment.
            if (this.settings.esriEnvironment) {
                var appLocation = void 0, instance = void 0;
                // Check to see if the app is hosted or a portal. If the app is hosted or a portal set the
                // portalUrl and the proxy. Otherwise use the portalUrl set it to arcgis.com.
                // We know app is hosted (or portal) if it has /apps/ or /home/ in the url.
                appLocation = location.pathname.indexOf(ESRI_APPS_PATH);
                if (appLocation === -1) {
                    appLocation = location.pathname.indexOf(ESRI_HOME_PATH);
                }
                // app is hosted and no portalUrl is defined so let's figure it out.
                if (appLocation !== -1) {
                    // hosted or portal
                    instance = location.pathname.substr(0, appLocation); //get the portal instance name
                    this.config.portalUrl = "https://" + location.host + instance;
                    this.config.proxyUrl = "https://" + location.host + instance + ESRI_PROXY_PATH;
                }
            }
            esriConfig.portalUrl = this.config.portalUrl;
            // Define the proxy url for the app
            if (this.config.proxyUrl) {
                esriConfig.request.proxyUrl = this.config.proxyUrl;
            }
        };
        Boilerplate.prototype._checkSignIn = function () {
            var signedIn, oAuthInfo;
            //If there's an oauth appid specified register it
            if (this.config.oauthappid) {
                oAuthInfo = new OAuthInfo({
                    appId: this.config.oauthappid,
                    portalUrl: this.config.portalUrl,
                    popup: true
                });
                IdentityManager.registerOAuthInfos([oAuthInfo]);
            }
            // check sign-in status
            signedIn = IdentityManager.checkSignInStatus(this.config.portalUrl + SHARING_PATH);
            // resolve regardless of signed in or not.
            return signedIn.always(promiseUtils.resolve);
        };
        Boilerplate.prototype._isDefined = function (value) {
            return (value !== undefined) && (value !== null);
        };
        Boilerplate.prototype._stripStringTags = function (data) {
            return data.replace(TAGS_RE, "");
        };
        Boilerplate.prototype._stripObjectTags = function (data) {
            return Object.keys(data).reduce(function (p, c, i) {
                var obj = p;
                if (typeof data[c] === "string") {
                    obj[c] === c.replace(TAGS_RE, "");
                }
                else {
                    obj[c] === c;
                }
                return obj;
            }, {});
        };
        Boilerplate.prototype._urlToObject = function () {
            var query = (window.location.search || "?").substr(1), map = {};
            query.replace(URL_RE, function (match, key, value) {
                map[key] = decodeURIComponent(value);
                return '';
            });
            return map;
        };
        return Boilerplate;
    }());
    exports.default = Boilerplate;
});
//# sourceMappingURL=boilerplate.js.map