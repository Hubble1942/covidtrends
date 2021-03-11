// custom graph component

const countriesOfInterest = [
  ['Austria', 8859000],
  ['Czechia', 10650000],
  ['France', 67060000],
  ['Germany', 83020000],
  ['Ireland', 4904000],
  ['Israel', 9053000],
  ['Italy', 60360000],
  ['Portugal', 10280000],
  ['Spain', 46940000],
  ['Sweden', 10230000],
  ['Switzerland', 8545000],
  ['United Kingdom', 66650000],
];

const dataTypes = ['Reported Deaths', 'Confirmed Cases'];

const normalize = (value, population) => value / population * 100000;

Vue.component('graph', {

  props: ['graphData', 'day', 'resize'],

  template: '<div ref="graph" id="graph" style="height: 100%;"></div>',

  methods: {

    mountGraph() {

      Plotly.newPlot(this.$refs.graph, [], {}, {responsive: true});

      this.$refs.graph.on('plotly_hover', this.onHoverOn)
        .on('plotly_unhover', this.onHoverOff)
        .on('plotly_relayout', this.onLayoutChange);

    },

    onHoverOn(data) {

      let curveNumber = data.points[0].curveNumber;
      let name = this.graphData.traces[curveNumber].name;

      if (name) {

        this.traceIndices = this.graphData.traces.map((e, i) => e.name === name ? i : -1).filter(e => e >= 0);
        let update = {'line': {color: 'rgba(254, 52, 110, 1)'}};

        for (let i of this.traceIndices) {
          Plotly.restyle(this.$refs.graph, update, [i]);
        }
      }

    },

    onHoverOff() {

      let update = {'line': {color: 'rgba(0,0,0,0.15)'}};

      for (let i of this.traceIndices) {
        Plotly.restyle(this.$refs.graph, update, [i]);
      }

    },

    onLayoutChange(data) {

      this.emitGraphAttributes();

      // if the user selects autorange, go back to the default range
      if (data['xaxis.autorange'] === true || data['yaxis.autorange'] === true) {
        this.userSetRange = false;
        this.updateGraph();
      }

      // if the user selects a custom range, use this
      else if (data['xaxis.range[0]']) {
        this.xrange = [data['xaxis.range[0]'], data['xaxis.range[1]']].map(e => parseFloat(e));
        this.yrange = [data['yaxis.range[0]'], data['yaxis.range[1]']].map(e => parseFloat(e));
        this.userSetRange = true;
      }

    },

    updateGraph() {

      // we're deep copying the layout object to avoid side effects
      // because plotly mutates layout on user input
      // note: this may cause issues if we pass in date objects through the layout
      let layout = JSON.parse(JSON.stringify(this.graphData.layout));

      // if the user selects a custom range, use it
      if (this.userSetRange) {
        layout.xaxis.range = this.xrange;
        layout.yaxis.range = this.yrange;
      }

      Plotly.react(this.$refs.graph, this.graphData.traces, layout, this.graphData.config);

    },

    emitGraphAttributes() {
      let graphOuterDiv = this.$refs.graph.querySelector('.main-svg').attributes;
      this.$emit('update:width', graphOuterDiv.width.nodeValue);
      this.$emit('update:height', graphOuterDiv.height.nodeValue);

      let graphInnerDiv = this.$refs.graph.querySelector('.xy').firstChild.attributes;
      this.$emit('update:innerWidth', graphInnerDiv.width.nodeValue);
      this.$emit('update:innerHeight', graphInnerDiv.height.nodeValue);
    }

  },

  mounted() {
    this.mountGraph();

    if (this.graphData) {
      this.updateGraph();
    }

    this.emitGraphAttributes();
    this.$emit('update:mounted', true);

  },

  watch: {

    graphData: {

      deep: true,

      handler(data, oldData) {

        // if UI state changes, revert to auto range
        if (JSON.stringify(data.uistate) !== JSON.stringify(oldData.uistate)) {
          this.userSetRange = false;
        }

        this.updateGraph();
      }

    },

    resize() {
      Plotly.Plots.resize(this.$refs.graph);
    },

  },

  data() {
    return {
      xrange: [], // stores user selected xrange
      yrange: [], // stores user selected yrange
      userSetRange: false, // determines whether to use user selected range
      traceIndices: [],
    };
  }

});

// global data
window.app = new Vue({

  el: '#root',

  mounted() {
    this.pullData(this.selectedData);
  },

  watch: {
    deaths() {
      this.selectedData = this.deaths ? dataTypes[0] : dataTypes[1];

      if (!this.firstLoad) {
        this.pullData();
      }
    },

    twoWeekSlope() {
      this.slopeDays = this.twoWeekSlope ? 14 : 7;

      if (!this.firstLoad) {
        this.pullData();
      }
    }
  },

  methods: {

    debounce(func, wait, immediate) { // https://davidwalsh.name/javascript-debounce-function
      let timeout;
      return function() {
        let context = this, args = arguments;
        let later = function() {
          timeout = null;
          if (!immediate) func.apply(context, args);
        };
        let callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
      };
    },

    myMax() { // https://stackoverflow.com/a/12957522
      let par = [];
      for (let i = 0; i < arguments.length; i++) {
        if (!isNaN(arguments[i])) {
          par.push(arguments[i]);
        }
      }
      return Math.max.apply(Math, par);
    },

    pullData() {

      let url = this.deaths
        ? 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv'
        : 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv';

      Plotly.d3.csv(url, (data) => this.processData(data));
    },

    removeRepeats(array) {
      return [...new Set(array)];
    },

    groupByCountry(data, dates) {

      let countries = data.map(e => e['Country/Region']);
      countries = this.removeRepeats(countries);

      let grouped = [];
      for (let country of countries) {

        let countryData = data.filter(e => e['Country/Region'] === country);

        const row = {region: country};

        for (let date of dates) {
          row[date] = countryData.map(e => parseInt(e[date]) || 0).reduce((a, b) => a + b);
        }

        grouped.push(row);

      }

      return grouped;
    },

    processData(data) {
      let dates = Object.keys(data[0]).slice(4);
      this.dates = dates;

      let grouped = this.groupByCountry(data, dates);

      let covidData = [];
      for (let row of grouped) {

        const arr = [];
        for (let date of dates) {
          arr.push(row[date]);
        }

        let slope = arr.map((e, i, a) => e - a[i - this.slopeDays]);
        let region = row.region;

        const cases = arr.map(e => e >= this.minCasesInCountry ? e : NaN);
        covidData.push({
          country: region,
          cases,
          slope: slope.map((e, i) => arr[i] >= this.minCasesInCountry ? e : NaN),
          maxCases: this.myMax(...cases)
        });

      }

      this.covidData = covidData.filter(e => e.maxCases > this.minCasesInCountry);
      this.firstLoad = false;
    },

    formatDate(date) {
      if (!date) {
        return '';
      }

      let [m, d, y] = date.split('/');
      return new Date(Date.UTC(2000 + (+y), m - 1, d)).toISOString().slice(0, 10);
    },

  },

  computed: {

    filteredCovidData() {
      return this.covidData.filter(e => this.selectedCountries.includes(e.country));
    },

    layout() {
      return {
        showlegend: false,
        autorange: false,
        xaxis: {
          type: 'linear',
          range: this.linearxrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        yaxis: {
          type: 'linear',
          range: this.linearyrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        hovermode: 'closest',
        font: {
          family: 'Open Sans, sans-serif',
          color: 'black',
          size: 14
        },
        margin: {
          l: 40,
          r: 0,
          b: 20,
          t: 0,
          pad: 4
        }
      };
    },

    traces() {

      let showDailyMarkers = this.filteredCovidData.length <= 2;

      // draws grey lines (line plot for each location)
      let trace1 = this.filteredCovidData.map((e, i) => {
        let population = countriesOfInterest.find(c => c[0] === e.country)[1];
        return {
          x: e.cases.slice(0, this.dates.length).map(v => normalize(v, population)),
          y: e.slope.slice(0, this.dates.length).map(v => normalize(v, population)),
          name: e.country,
          text: this.dates.map(date => e.country + '<br>' + this.formatDate(date)),
          mode: showDailyMarkers ? 'lines+markers' : 'lines',
          type: 'scatter',
          legendgroup: i,
          marker: {
            size: 4,
            color: 'rgba(0,0,0,0.15)'
          },
          line: {
            color: 'rgba(0,0,0,0.15)'
          },
          hoverinfo: 'x+y+text',
          hovertemplate:
            '%{text}<br>Total '
            + ': %{x:.0f} / 100\'000<br>'
            + `${this.slopeDays}-Days `
            + ': %{y:.3g} / 100\'000<extra></extra>',
        };
      });

      // draws red dots (most recent data for each location)
      let trace2 = this.filteredCovidData.map((e, i) => {
        let population = countriesOfInterest.find(c => c[0] === e.country)[1];
        return {
          x: [e.cases[this.dates.length - 1]].map(v => normalize(v, population)),
          y: [e.slope[this.dates.length - 1]].map(v => normalize(v, population)),
          text: e.country,
          name: e.country,
          mode: 'markers+text',
          legendgroup: i,
          textposition: 'center right',
          marker: {
            size: 6,
            color: 'rgba(254, 52, 110, 1)'
          },
          hovertemplate:
            '<br>Total '
            + ': %{x:.0f} / 100\'000<br>'
            + `${this.slopeDays}-Days `
            + ': %{y:.3g} / 100\'000<extra></extra>',
        };
      });

      return [...trace1, ...trace2];
    },

    config() {
      return {
        responsive: true,
        toImageButtonOptions: {
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'Covid Trends',
          height: 600,
          width: 600 * this.graphAttributes.width / this.graphAttributes.height,
          scale: 1 // Multiply title/legend/axis/canvas sizes by this factor
        }
      };
    },

    graphData() {
      return {
        uistate: { // graph is updated when uistate changes
          selectedData: this.selectedData,
        },
        traces: this.traces,
        layout: this.layout,
        config: this.config
      };
    },

    linearxrange() {
      let cases = Array.prototype.concat(...this.filteredCovidData.map(e => {
        let population = countriesOfInterest.find(c => c[0] === e.country)[1];
        return e.cases.filter(e => !isNaN(e)).map(v => normalize(v, population));
      }));

      let xmax = Math.max(...cases, 50);
      return [0, Math.round(1.05 * xmax)];
    },

    linearyrange() {
      let slope = Array.prototype.concat(...this.filteredCovidData.map(e => {
        let population = countriesOfInterest.find(c => c[0] === e.country)[1];
        return e.slope.filter(e => !isNaN(e)).map(v => normalize(v, population));
      }));

      let ymax = Math.max(...slope, 6);
      return [-Math.pow(10, Math.floor(Math.log10(ymax)) - 2), Math.round(1.05 * ymax)];
    },
  },

  data: {
    deaths: false,
    selectedData: dataTypes[1],

    twoWeekSlope: true,
    slopeDays: 14,

    minCasesInCountry: 50,

    dates: [],

    covidData: [],

    countries: countriesOfInterest.map(c => c[0]).sort(),

    selectedCountries: countriesOfInterest.map(c => c[0]),

    firstLoad: true,

    graphAttributes: {
      mounted: false,
      innerWidth: NaN,
      innerHeight: NaN,
      width: NaN,
      height: NaN,
    },

  }

});
