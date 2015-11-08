// SmartThings JSON API SmartApp required
// https://github.com/alindeman/homebridge-smartthings/blob/master/JSON.groovy
//
var request = require("request");

var Service, Characteristic, Accessory, uuid;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.hap.Accessory;
  uuid = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-smartthings", "SmartThings", SmartThingsPlatform);
}

function SmartThingsPlatform(log, config){
  this.log          = log;
  this.app_id       = config["app_id"];
  this.access_token = config["access_token"];
}

SmartThingsPlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching SmartThings devices...");

    var that = this;
    var foundAccessories = [];

    request.get({
      url: "https://graph.api.smartthings.com/api/smartapps/installations/"+this.app_id+"/devices?access_token="+this.access_token,
      json: true
    }, function(err, response, json) {
      if (!err && response.statusCode == 200) {
        ['switches', 'hues', 'thermostats'].forEach(function(key) {
          if (json[key]) {
            json[key].forEach(function(thing) {
              var accessory = new SmartThingsAccessory(that.log, thing.name, thing.commands);
              foundAccessories.push(accessory);
            });
          }
        });

        callback(foundAccessories);
      } else {
        that.log("There was a problem authenticating with SmartThings.");
      }
    });
  }
}

function SmartThingsAccessory(log, name, commands) {
  // device info
  this.name     = name;
  this.commands = commands;
  this.log      = log;
}

SmartThingsAccessory.prototype.getServices = function() {
  var services = [];

  var accessoryInformationService = new Service.AccessoryInformation();
  accessoryInformationService
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, "SmartThings")
    .setCharacteristic(Characteristic.Model, "Rev-1")
    .setCharacteristic(Characteristic.SerialNumber, "A1S2NASF88EW");
  services.push(accessoryInformationService);

  if (this.commands['on'] && this.commands['setLevel']) {
    var lightbulbService = new Service.Lightbulb(this.name);
    lightbulbService.getCharacteristic(Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));
    lightbulbService.getCharacteristic(Characteristic.Brightness)
      .on('set', this.setBrightness.bind(this))
      .on('get', this.getBrightness.bind(this))

    if (this.commands['setHue']) {
      lightbulbService.getCharacteristic(Characteristic.Hue)
        .on('set', this.setHue.bind(this))
        .on('get', this.getHue.bind(this))
    }
    if (this.commands['setSaturation']) {
      lightbulbService.getCharacteristic(Characteristic.Saturation)
        .on('set', this.setSaturation.bind(this))
        .on('get', this.getSaturation.bind(this))
    }
  } else if (this.commands['on']) {
    var switchService = new Service.Switch(this.name);
    switchService.getCharacteristic(Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));

    services.push(switchService);
  }

  return services;
}

SmartThingsAccessory.prototype.setOn = function(value, cb) {
  if (value == 0) {
    this.command("off", cb);
  } else {
    this.command("on", cb);
  }
}

SmartThingsAccessory.prototype.getOn = function(cb) {
  this.currentValue("switch", function(err, value) {
    if (err) {
      if (cb) cb(err);
    } else if (value === "on") {
      cb(null, 1);
    } else {
      cb(null, 0);
    }
  });
}

SmartThingsAccessory.prototype.setBrightness = function(value, cb) {
  this.command("setLevel", value, cb);
}

SmartThingsAccessory.prototype.getBrightness = function(cb) {
  this.currentValue("level", cb);
}

SmartThingsAccessory.prototype.setHue = function(value, cb) {
  this.command("setHue", value, cb);
}

SmartThingsAccessory.prototype.getHue = function(cb) {
  this.currentValue("hue", cb);
}

SmartThingsAccessory.prototype.setSaturation = function(value, cb) {
  this.command("setSaturation", value, cb);
}

SmartThingsAccessory.prototype.getSaturation = function(cb) {
  this.currentValue("saturation", cb);
}

SmartThingsAccessory.prototype.command = function(command, value, cb) {
  if (typeof(value) === "function") {
    cb = value;
    value = undefined;
  }

  var url = this.commands[command];
  if (value) {
      url += "&value=" + encodeURIComponent(value)
  }

  this.log(this.name + " sending command " + command + "(" + value + ")");

  var that = this;
  request.put({
    url: url + "&value=" + encodeURIComponent(value)
  }, function(err, response, body) {
    if (err) {
      that.log(that.name + " error sending command: " + url);
      if (cb) cb("error sending command");
    } else {
      if (cb) cb(null);
    }
  });
}

SmartThingsAccessory.prototype.currentValue = function(attribute, cb) {
  var url = this.attributes[attribute];
  request.get({
    url: url
  }, function(err, response, body) {
    if (err || response.statusCode != 200) {
      that.log(that.name + " error getting attribute: " + url);
      if (cb) cb("error getting attribute");
    } else {
      var obj = JSON.parse(body);
      if (obj.currentValue) {
        if (cb) cb(null, obj.currentValue);
      } else {
        if (cb) cb("current value not available");
      }
    }
  });
}
