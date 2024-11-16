var gc = new GameCanvas();

var camera = new Vector(0, 0);
var car = new Car();

var id = Math.floor(Math.random() * 9999999);
var websocket = new WebSocket("wss://CarGameServer.tc5550.repl.co");
var otherClients = [];

websocket.onmessage = function(msg) {
  var parsed = JSON.parse(msg.data);
  for (var i = 0; i < parsed.data.length; i++) {
    var client = parsed.data[i];
    
    var found;
    for (var otherClient of otherClients) {
      if (otherClient.id == client.id) {
        found = otherClient;
        break;
      }
    }
    
    if (!found) {
      found = new OtherPlayer(client.id);
      otherClients.push(found);
    }
    
    found.pos = new Vector(client.pos);
    found.velocity = new Vector(client.velocity);
    found.angle = client.angle;
    found.angularVelocity = client.angularVelocity;
  }
}

function OtherPlayer(id) {
  this.id = id;
  this.pos = new Vector(0, 0);
  this.velocity = new Vector(0, 0);
  this.angle = 0;
  this.angularVelocity = 0;
  
  this.update = function(dt = 1) {
    this.pos = Vector.add(this.pos, Vector.multiply(this.velocity, dt));
    this.angle += this.angularVelocity * dt;
  }
  
  this.render = function() {
    var screenPos = toScreen(this.pos);
    circle(screenPos.x, screenPos.y, 10, "red");

    gc.ctx.save();
    gc.ctx.beginPath();
    gc.ctx.translate(screenPos.x, screenPos.y);
    gc.ctx.rotate(-this.angle - Math.PI * 0.5);
    picture("https://clipartstation.com/wp-content/uploads/2018/10/race-car-top-down-clipart-2.png", -100, -50, 200, 100);
    gc.ctx.restore();
  }
}

function toScreen(v) {
  return new Vector(
    width / 2 + v.x * 50,
    height / 2 - v.y * 50
  );
}

loop();
function loop() {
  clearScreen();
  
  camera.x = -car.pos.x * 50;
  camera.y = car.pos.y * 50;
  
  gc.ctx.save();
  gc.ctx.translate(camera.x, camera.y);
  
  car.update(1 / 60);
  car.render();
  
  if (websocket.readyState == websocket.OPEN)
    websocket.send(JSON.stringify({
      type: "setData",
      data: {id, pos: {x: car.pos.x, y: car.pos.y}, velocity: {x: car.velocity.x, y: car.velocity.y}, angle: car.angle, angularVelocity: car.angularVelocity}
    }));
  
  for (var i = 0; i < otherClients.length; i++) {
    var d = otherClients[i];
    d.update(1 / 60);
    d.render();
  }
  
  gc.ctx.restore();
  
  update();
  requestAnimationFrame(loop);
}

function Car(x = 0, y = 0) {
  this.wheelBase = 2.511;
  this.track = 1.7;
  this.width = 2.55;
  this.height = 1.9;
  
  this.wheels = [{pos: {
    x: -this.track / 2,
    y: this.wheelBase / 2
  }, isFrontWheel: true}, {pos: {
    x: this.track / 2,
    y: this.wheelBase / 2
  }, isFrontWheel: true}, {pos: {
    x: this.track / 2,
    y: -this.wheelBase / 2
  }, isFrontWheel: false}, {pos: {
    x: -this.track / 2,
    y: -this.wheelBase / 2
  }, isFrontWheel: false}];
  
  this.pos = new Vector(x, y);
  this.velocity = new Vector(0, 0);
  this.acceleration = new Vector(0, 0);
  this.mass = 1500;
  
  this.angle = 0;
  this.angularVelocity = 0;
  this.angularAcceleration = 0;
  this.momentOfInertia = 1/12 * this.mass * (this.width ** 2 + this.height ** 2);
  
  this.maxSteerAngle = 35 * Math.PI / 180;
  this.currentSteerAngle = 0;
  
  this.driveInput = 0;
  
  this.skidmarks = [
    new Skidmarks(),
    new Skidmarks(),
    new Skidmarks(),
    new Skidmarks()
  ];
  this.smoke = new Smoke();
  
  this.worldVectorToLocalSpace = function(v) {
    return new Vector({
      x: (v.x * Math.cos(this.angle) + v.y * Math.sin(this.angle)),
      y: (-v.x * Math.sin(this.angle) + v.y * Math.cos(this.angle))
    });
  }
  
  this.localToWorldSpace = function(v) {
    return new Vector({
      x: this.pos.x + (v.x * Math.cos(this.angle) - v.y * Math.sin(this.angle)),
      y: this.pos.y + (v.x * Math.sin(this.angle) + v.y * Math.cos(this.angle))
    });
  }
  
  this.worldToScreenSpace = function(v) {
    return new Vector(
      width / 2 + v.x * 50,
      height / 2 - v.y * 50
    );
  }
  
  this.addForceAtPosition = function(force, position) {
    this.acceleration = Vector.add(this.acceleration, Vector.multiply(force, 1 / this.mass));
    
    var r = Vector.subtract(position, this.pos);
    this.angularAcceleration += (r.x * force.y - r.y * force.x) / this.momentOfInertia;
  }
  
  this.getPointVelocity = function(point) {
    return {
      x: this.velocity.x + (point.y - this.pos.y) * -this.angularVelocity,
      y: this.velocity.y + (point.x - this.pos.x) * this.angularVelocity
    };
  }
  
  this.rotateVector = function(v, angle = this.angle) {
    return new Vector(
      v.x * Math.cos(angle) - v.y * Math.sin(angle),
      v.x * Math.sin(angle) + v.y * Math.cos(angle)
    );
  }
  
  this.forward = function() {
    return this.rotateVector(new Vector(0, 1));
  }
  
  this.update = function(dt = 1) {
    var steerAmount = key("a") ? 1 : key("d") ? -1 : 0;
    this.currentSteerAngle = this.maxSteerAngle * steerAmount;
    
    this.driveInput = key("w") ? 1 : key("s") ? -1 : 0;
    
    var localVelocity = this.worldVectorToLocalSpace(this.velocity);
    
    var i = 0;
    for (var wheel of this.wheels) {
      var wheelPos = wheel.pos;
      var wheelWorldPos = this.localToWorldSpace(wheelPos);
      var isFrontWheel = wheel.isFrontWheel;
      
      var wheelForward = this.rotateVector(new Vector(0, 1), this.angle + (isFrontWheel ? this.currentSteerAngle : 0));
      var wheelSideways = this.rotateVector(new Vector(1, 0), this.angle + (isFrontWheel ? this.currentSteerAngle : 0));
      
      var wheelVelocity = this.getPointVelocity(wheelWorldPos);
      var localWheelVelociy = this.worldVectorToLocalSpace(wheelVelocity);
      var forwardVelocity = localWheelVelociy.y;
      var sidewaysVelocity = localWheelVelociy.x;
      
      var slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity)) - (isFrontWheel ? this.currentSteerAngle * Math.sign(localVelocity.y) : 0);
      if (isNaN(slipAngle)) slipAngle = 0;
      var latFriction = clamp(slipAngle * 1.6, -1, 1) * (isFrontWheel ? 1 : 1 - Math.abs(this.driveInput) * 0.3);
      this.addForceAtPosition(Vector.multiply(wheelSideways, 5000 * latFriction), wheelWorldPos);
      
      if (!isFrontWheel) {
        this.addForceAtPosition(Vector.multiply(wheelForward, 8000 * this.driveInput), wheelWorldPos);
      }
      
      var wheelScreenPos = this.worldToScreenSpace(wheelWorldPos);
      this.skidmarks[i].points.push({pos: wheelScreenPos, alpha: clamp(Math.abs(slipAngle * 0.6), 0, 1)});
      if (this.skidmarks[i].points.length > 300) {
        this.skidmarks[i].points.shift();
      }
      
      if (!isFrontWheel && Math.abs(this.driveInput) > 0) {
        var angle = this.angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.1;
        this.smoke.addParticle(wheelScreenPos, Vector.multiply(new Vector(Math.cos(angle), Math.sin(angle)), 50), Math.random() * Math.PI * 2, Math.random() - 0.5, 3, [200, 200, 200], 15, 35);
      }
      
      i++;
    }
    
    this.velocity = Vector.add(this.velocity, Vector.multiply(this.acceleration, dt));
    this.pos = Vector.add(this.pos, Vector.multiply(this.velocity, dt));
    
    this.angularVelocity += this.angularAcceleration * dt;
    this.angle += this.angularVelocity * dt;
    
    this.acceleration = new Vector(0, 0);
    this.angularAcceleration = 0;
    
    this.smoke.update(dt);
  }
  
  this.render = function() {
    for (var skidmark of this.skidmarks)
      skidmark.render();
    
    for (var wheel of this.wheels) {
      var wheelPos = wheel.pos;
      var worldPos = this.localToWorldSpace(wheelPos);
      var screenPos = this.worldToScreenSpace(worldPos);
      rotatedRectangle(screenPos.x, screenPos.y, 10, 25, "black", this.angle + (wheel.isFrontWheel ? this.currentSteerAngle : 0));
    }
    
    var carScreenPos = this.worldToScreenSpace(this.pos);
    gc.ctx.save();
    gc.ctx.beginPath();
    gc.ctx.translate(carScreenPos.x, carScreenPos.y);
    gc.ctx.rotate(-this.angle - Math.PI * 0.5);
    picture("https://clipartstation.com/wp-content/uploads/2018/10/race-car-top-down-clipart-2.png", -100, -50, 200, 100);
    gc.ctx.restore();
    
    this.smoke.render();
  }
}

function Skidmarks() {
  this.points = [];
  
  this.render = function() {
    for (var i = 0; i < this.points.length - 1; i++) {
      var point = this.points[i];
      var point2 = this.points[i + 1];
      line(point.pos.x, point.pos.y, point2.pos.x, point2.pos.y, 10, "rgba(30, 30, 30, " + point.alpha + ")");
      
      this.points[i].alpha -= 0.001;
    }
  }
}

function Smoke() {
  this.particles = [];
  
  this.update = function(dt = 1) {
    for (var i = 0; i < this.particles.length; i++) {
      var particle = this.particles[i];
      particle.pos = Vector.add(particle.pos, Vector.multiply(particle.velocity, dt));
      particle.angle += particle.angularVelocity * dt;
      particle.size += particle.sizeVelocity * dt;
      particle.health -= dt;
      
      if (particle.health <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
  
  this.render = function() {
    for (var i = 0; i < this.particles.length; i++) {
      var particle = this.particles[i];
      
      var alpha = particle.health / particle.maxHealth * 0.5;
      var color = `rgb(${particle.color[0]}, ${particle.color[0]}, ${particle.color[0]}, ${alpha})`;
      rotatedRectangle(particle.pos.x, particle.pos.y, particle.size, particle.size, color, particle.angle);
    }
  }
  
  this.addParticle = function(pos, velocity, angle, angularVelocity, health, color, size, sizeVelocity) {
    this.particles.push({pos, velocity, angle, angularVelocity, health, maxHealth: health, color, size, sizeVelocity});
  }
}

function rotatedRectangle(x, y, w, h, color, angle) {
  gc.ctx.save();
  gc.ctx.beginPath();
  gc.ctx.translate(x, y);
  gc.ctx.rotate(-angle);
  gc.ctx.fillStyle = color;
  gc.ctx.fillRect(-w / 2, -h / 2, w, h);
  gc.ctx.fill();
  gc.ctx.restore();
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}