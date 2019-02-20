// const Thing = require('../thing');
const API = require('../api');
const App = require('../app');
const Utils = require('../utils');

class Log {
  constructor(thingId, propertyId) {
    this.thingId = thingId;
    this.propertyId = propertyId;
    this.start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.end = new Date();

    this.margin = 20;
    this.xStart = 120 + 2 * this.margin;
    this.width = window.innerWidth - 2 * this.margin;
    this.height = 120;
    this.graphHeight = this.height - 2 * this.margin;
    this.graphWidth = this.width - this.xStart - this.margin;

    this.elt = document.createElement('div');
    this.elt.classList.add('logs-log-container');
    this.drawSkeleton();
  }

  drawSkeleton() {
    // Get in the name and webcomponent
    this.name = document.createElement('h3');
    this.name.classList.add('logs-log-name');
    this.name.textContent = `${this.thingId}.${this.propertyId}`;
    const thingContainer = document.createElement('div');
    // new Thing(thingContainer); // TODO

    const infoContainer = document.createElement('div');
    infoContainer.classList.add('logs-log-info');
    infoContainer.appendChild(this.name);
    infoContainer.appendChild(thingContainer);
    this.elt.appendChild(infoContainer);

    this.graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.graph.classList.add('logs-graph');
    this.graph.style.width = `${this.width}px`;
    this.graph.style.height = `${this.height}px`;

    const axesPath = this.makePath([
      {x: this.xStart, y: this.margin},
      {x: this.xStart, y: this.height - this.margin},
      {x: this.width - this.margin, y: this.height - this.margin},
    ]);
    axesPath.classList.add('logs-graph-axes');

    this.graph.appendChild(axesPath);

    this.yAxisLabel = this.makeText('W', this.xStart - this.margin / 4,
                                    this.height / 2, 'end', 'middle');
    this.yAxisLabel.classList.add('logs-graph-label');
    // const timeLabels = this.makeText('why', (this.xStart + this.width -
    // this.margin) / 2, this.height / 2, 'left');

    this.graph.appendChild(this.yAxisLabel);

    // Draw axes
    // Draw labels if applicable
    this.elt.appendChild(this.graph);
  }

  makePath(points) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const text = ['M', points[0].x, points[0].y];
    for (let i = 1; i < points.length; i++) {
      text.push('L', points[i].x, points[i].y);
    }
    path.setAttribute('d', text.join(' '));
    return path;
  }

  makeText(text, x, y, anchor, baseline) {
    const elt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    elt.textContent = text;
    elt.setAttribute('text-anchor', anchor);
    elt.setAttribute('dominant-baseline', baseline);
    elt.setAttribute('x', x);
    elt.setAttribute('y', y);
    return elt;
  }

  async reload() {
    await this.load();
    this.redrawLog();
    // fetch data render graph
  }

  async load() {
    const thing = await App.gatewayModel.getThingModel(this.thingId);
    if (!thing) {
      // be sad
      return;
    }
    const thingName = thing.name;
    this.property = thing.propertyDescriptions[this.propertyId];
    const propertyName = this.property.title;
    this.name.textContent = `${thingName} ${propertyName}`;

    const propertyUnit = this.property.unit || '';
    this.yAxisLabel.textContent = Utils.unitNameToAbbreviation(propertyUnit);

    const res = await fetch(`/logs/things/${this.thingId}/properties/${this.propertyId}`, {
      headers: API.headers(),
    });
    const data = await res.json();
    if (!data || !data.length) {
      this.rawPoints = [];
      return;
    }
    this.rawPoints = data.map(function(point) {
      return {
        value: point.value,
        date: new Date(point.date),
      };
    });
  }

  valueBounds() {
    if (this.property.unit === 'percent') {
      return {
        min: 0,
        max: 100,
      };
    }
    if (this.property.hasOwnProperty('minimum') &&
        this.property.hasOwnProperty('maximum')) {
      return {
        min: this.property.minimum,
        max: this.property.maximum,
      };
    }
    if (this.property.type === 'boolean') {
      return {
        min: 0,
        max: 1,
      };
    }

    if (this.rawPoints.length === 0) {
      return {min: 0, max: 1};
    }
    let min = this.rawPoints[0].value;
    let max = min;
    for (let i = 1; i < this.rawPoints.length; i++) {
      const value = this.rawPoints[i].value;
      if (max < value) {
        max = value;
      }
      if (min > value) {
        min = value;
      }
    }
    const margin = 0.1 * (max - min);
    return {
      min: min - margin,
      max: max + margin,
    };
  }


  redrawLog() {
    if (!this.property) {
      return;
    }

    const bounds = this.valueBounds();
    const yMin = Math.min(0, bounds.min);
    const yMax = bounds.max;
    const yScale = (y) => {
      return this.height - this.margin - (y - yMin) / (yMax - yMin) *
        this.graphHeight;
    };

    const startTime = this.start.getTime();
    const endTime = this.end.getTime();

    const xScale = (x) => {
      return (x - startTime) / (endTime - startTime) * this.graphWidth +
        this.xStart;
    };

    const points = this.rawPoints.map((raw) => {
      return {
        x: xScale(raw.date.getTime()),
        y: yScale(raw.value),
      };
    });

    if (points.length > 0) {
      const graphLine = this.makePath(points);
      graphLine.classList.add('logs-graph-line');

      points.unshift({
        x: points[0].x,
        y: this.height - this.margin,
      });
      points.push({
        x: points[points.length - 1].x,
        y: this.height - this.margin,
      });

      const graphFill = this.makePath(points);
      graphFill.classList.add('logs-graph-fill');

      this.graph.appendChild(graphFill);
      this.graph.appendChild(graphLine);
    }

    let yMinLabel = yMin;
    let yMaxLabel = yMax;
    if (Math.abs(yMax - yMin) > 1) {
      yMaxLabel = Math.floor(yMaxLabel);
      yMinLabel = Math.floor(yMinLabel);
    }

    let labelText = `${yMinLabel}`;
    if (this.property.type === 'boolean') {
      labelText = this.propertyLabel(false);
    }
    let label = this.makeText(labelText, this.xStart - this.margin / 4,
                              yScale(yMinLabel), 'end', 'middle');
    label.classList.add('logs-graph-label');
    this.graph.appendChild(label);

    labelText = `${yMaxLabel}`;
    if (this.property.type === 'boolean') {
      labelText = this.propertyLabel(true);
    }
    label = this.makeText(labelText, this.xStart - this.margin / 4,
                          yScale(yMaxLabel), 'end', 'middle');
    label.classList.add('logs-graph-label');
    this.graph.appendChild(label);

    let xLabel = this.floorDate(new Date(startTime)).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (xLabel < startTime) {
      xLabel += oneDayMs;
    }
    while (xLabel < endTime) {
      const text = new Date(xLabel).getDate();
      label = this.makeText(text, xScale(xLabel),
                            this.height - this.margin, 'middle', 'hanging');
      label.classList.add('logs-graph-label');
      this.graph.appendChild(label);

      xLabel += oneDayMs;
    }
  }

  /**
   * Return a label for a property's value
   */
  propertyLabel(value) {
    if (this.property.type === 'boolean') {
      switch (this.property['@type']) {
        case 'OnOffProperty':
          return value ? 'ON' : 'OFF';
        case 'MotionProperty':
          return value ? 'MOTION' : 'NO MOTION';
        case 'OpenProperty':
          return value ? 'OPEN' : 'CLOSED';
        case 'LeakProperty':
          return value ? 'LEAK' : 'DRY';
        case 'PushedProperty':
          return value ? 'PUSHED' : 'NOT PUSHED';
        case 'BooleanProperty':
        default:
          return value ? 'TRUE' : 'FALSE';
      }
    }
    return `${value}`;
  }

  /**
   * Convert a date to the start of its day, i.e. zero out hours, minutes, and
   * seconds.
   * TODO: support timezones
   */
  floorDate(date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    return date;
  }
}

module.exports = Log;
