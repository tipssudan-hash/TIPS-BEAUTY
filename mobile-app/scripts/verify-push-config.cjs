const fs = require("fs");
const config = JSON.parse(fs.readFileSync("/tmp/tips-expo-public-config.json", "utf8"));
const plugins = config.plugins ?? [];
const hasNotificationsPlugin = plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications");
if (!hasNotificationsPlugin) throw new Error("expo-notifications plugin is missing");
if (!config.extra?.eas?.projectId) throw new Error("EAS projectId is missing");
console.log("Expo Push configuration verified");
