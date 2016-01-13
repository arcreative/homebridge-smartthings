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
  this.log                = log;
  this.app_id             = config["app_id"];
  this.access_token       = config["access_token"];
  this.temperature_scale  = null;
}

SmartThingsPlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching SmartThings devices...");

    var that = this;
    var foundAccessories = [];

    request.get({
      url: "https://graph.api.smartthings.com/api/smartapps/installations/"+that.app_id+"/location?access_token="+that.access_token,
      json: true
    }, function(err, response, location) {
      if (err || response.statusCode != 200) {
        that.log("Error starting StartThings: " + err);
      } else {
        that.temperature_scale = Characteristic.TemperatureDisplayUnits[location.temperature_scale === 'F' ? 'FAHRENHEIT' : 'CELSIUS'];
        request.get({
          url: "https://graph.api.smartthings.com/api/smartapps/installations/"+that.app_id+"/devices?access_token="+that.access_token,
          json: true
        }, function(err, response, json) {
          if (err || response.statusCode != 200) {
            that.log("Error starting StartThings: " + err);
          } else {
            ['switches', 'hues', 'thermostats'].forEach(function(key) {
              if (json[key]) {
                json[key].forEach(function(thing) {
                  var accessory = new SmartThingsAccessory(that.log, location, thing.name, thing.commands, thing.attributes, that);
                  foundAccessories.push(accessory);
                });
              }
            });

            callback(foundAccessories);
          }
        });
      }
    });
  }
}

function SmartThingsAccessory(log, location, name, commands, attributes, platform) {
  this.log        = log;
  this.location   = location;
  this.name       = name;
  this.commands   = commands;
  this.attributes = attributes;
  this.platform   = platform;
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

    services.push(lightbulbService);
  } else if (this.commands['on']) {
    var switchService = new Service.Switch(this.name);
    switchService.getCharacteristic(Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));

    services.push(switchService);
  } else if (this.commands['setHeatingSetpoint'] || this.commands['setCoolingSetpoint']) {
    var thermostatService = new Service.Thermostat(this.name);
    thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
    thermostatService.getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));
    thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this));
    thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));
    thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getTemperatureDisplayUnits.bind(this));

    services.push(thermostatService);
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

SmartThingsAccessory.prototype.getCurrentTemperature = function(cb) {
  var that = this;
  this.currentTemperatureValue("temperature", cb);
}

SmartThingsAccessory.prototype.getTargetTemperature = function(cb) {
  var that = this;
  this.getTargetHeatingCoolingState(function(err, mode) {
    if (err) {
      if (cb) cb(err);
    } else if (mode == Characteristic.TargetHeatingCoolingState.COOL) {
      that.currentTemperatureValue("coolingSetpoint", cb);
    } else if (mode == Characteristic.TargetHeatingCoolingState.HEAT) {
      that.currentTemperatureValue("heatingSetpoint", cb);
    } else if (mode == Characteristic.TargetHeatingCoolingState.AUTO) {
      // TODO
      if (cb) cb("unimplemented");
    } else {
      if (cb) cb(null, undefined);
    }
  });
}

SmartThingsAccessory.prototype.setTargetTemperature = function(value, cb) {
  var that = this;
  this.getTargetHeatingCoolingState(function(err, mode) {
    if (err) {
      if (cb) cb(err);
    } else if (mode == Characteristic.TargetHeatingCoolingState.COOL) {
      that.temperatureCommand("setCoolingSetpoint", value, cb);
    } else if (mode == Characteristic.TargetHeatingCoolingState.HEAT) {
      that.temperatureCommand("setHeatingSetpoint", value, cb);
    } else if (mode == Characteristic.TargetHeatingCoolingState.AUTO) {
      // TODO
      if (cb) cb("unimplemented");
    } else {
      if (cb) cb("target state is off");
    }
  });
}

SmartThingsAccessory.prototype.getCurrentHeatingCoolingState = function(cb) {
  this.currentValue("thermostatOperatingState", function(err, mode) {
    if (err) {
      if (cb) cb(err);
    } else if (mode == "cooling") {
      if (cb) cb(null, Characteristic.CurrentHeatingCoolingState.COOL);
    } else if (mode == "heating") {
      if (cb) cb(null, Characteristic.CurrentHeatingCoolingState.HEAT);
    } else {
      if (cb) cb(null, Characteristic.CurrentHeatingCoolingState.OFF);
    }
  });
}

SmartThingsAccessory.prototype.getTargetHeatingCoolingState = function(cb) {
  this.currentValue("thermostatMode", function(err, mode) {
    if (err) {
      if (cb) cb(err);
    } else if (mode == "cool") {
      if (cb) cb(null, Characteristic.TargetHeatingCoolingState.COOL);
    } else if (mode == "heat") {
      if (cb) cb(null, Characteristic.TargetHeatingCoolingState.HEAT);
    } else if (mode == "auto") {
      if (cb) cb(null, Characteristic.TargetHeatingCoolingState.AUTO);
    } else {
      if (cb) cb(null, Characteristic.TargetHeatingCoolingState.OFF);
    }
  });
}

SmartThingsAccessory.prototype.setTargetHeatingCoolingState = function(value, cb) {
  var cmdValue = null;
  if (value == Characteristic.TargetHeatingCoolingState.COOL) {
    cmdValue = "cool";
  } else if (value == Characteristic.TargetHeatingCoolingState.HEAT) {
    cmdValue = "heat";
  } else if (value == Characteristic.TargetHeatingCoolingState.AUTO) {
    cmdValue = "range";
  } else if (value == Characteristic.TargetHeatingCoolingState.OFF) {
    cmdValue = "off";
  }

  if (cmdValue) {
    this.command("setThermostatMode", cmdValue, cb);
  } else {
    if (cb) cb("unknown target heating cooling state");
  }
}

SmartThingsAccessory.prototype.getTemperatureDisplayUnits = function(cb) {
  if (cb) cb(null, this.platform.temperature_scale);
}

SmartThingsAccessory.prototype.command = function(command, value, cb) {
  if (typeof(value) === "function") {
    cb = value;
    value = undefined;
  }

  var url = this.commands[command];
  var body = {};
  if (value) {
    body.value = value;
  }

  this.log(this.name + " sending command " + command + "(" + value + ")");

  var that = this;
  request.put({
    url: url,
    json: true,
    body: body
  }, function(err, response, body) {
    if (err) {
      that.log(that.name + " error sending command: " + url);
      if (cb) cb("error sending command");
    } else {
      if (cb) cb(null);
    }
  });
}

SmartThingsAccessory.prototype.temperatureCommand = function(command, value, cb) {
  if (value && this.platform.temperature_scale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
    value = toFahrenheit(value);
  }
  this.command(command, value, cb);
}

SmartThingsAccessory.prototype.currentValue = function(attribute, cb) {
  var that = this;
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

SmartThingsAccessory.prototype.currentTemperatureValue = function(attribute, cb) {
  var that = this;
  this.currentValue(attribute, function(err, val) {
    if (val && that.platform.temperature_scale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
      val = toCelsius(val);
    }
    if (cb) cb(err, val);
  });
}

function toCelsius(temperature) {
  return Number(((temperature - 32) / 1.8).toFixed(1));
}
function toFahrenheit(temperature) {
  return Math.round(temperature * 1.8 + 32);
}