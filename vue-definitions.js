// custom graph component

const countriesOfInterest = [
  ['Austria', 1],
  ['France', 1],
  ['Germany', 1],
  ['Israel', 1],
  ['Italy', 1],
  ['Spain', 1],
  ['Sweden', 1],
  ['Switzerland', 1],
  ['United Kingdom', 1],
];

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
    this.pullData(this.selectedData, this.selectedRegion);
  },

  watch: {
    selectedData() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, this.selectedRegion, /*updateSelectedCountries*/ true);
      }
    },

    selectedRegion() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, this.selectedRegion, /*updateSelectedCountries*/ false);
      }
    },

    minDay() {
      if (this.day < this.minDay) {
        this.day = this.minDay;
      }
    },

    'graphAttributes.mounted': function() {

      if (this.graphAttributes.mounted && this.autoplay && this.minDay > 0) {
        this.day = this.minDay;
        this.play();
        this.autoplay = false; // disable autoplay on first play
      }
    },
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

    myMin() {
      let par = [];
      for (let i = 0; i < arguments.length; i++) {
        if (!isNaN(arguments[i])) {
          par.push(arguments[i]);
        }
      }
      return Math.min.apply(Math, par);
    },

    pullData(selectedData) {

      let url;
      if (selectedData === 'Confirmed Cases') {
        url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv';
      } else if (selectedData === 'Reported Deaths') {
        url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv';
      } else {
        return;
      }
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
      this.day = this.dates.length;

      let grouped = this.groupByCountry(data, dates);

      let covidData = [];
      for (let row of grouped) {

        const arr = [];
        for (let date of dates) {
          arr.push(row[date]);
        }

        let slope = arr.map((e, i, a) => e - a[i - this.lookbackTime]);
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
      //this.countries = this.covidData.map(e => e.country).sort();

      this.firstLoad = false;
    },

    formatDate(date) {
      if (!date) {
        return '';
      }

      let [m, d, y] = date.split('/');
      return new Date(Date.UTC(2000 + (+y), m - 1, d)).toISOString().slice(0, 10);
    },

    dateToText(date) {
      if (!date) {
        return '';
      }

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      let [m, d] = date.split('/');
      return monthNames[m - 1] + ' ' + d;
    },

    toggleHide() {
      this.isHidden = !this.isHidden;
    },

  },

  computed: {

    filteredCovidData() {
      return this.covidData.filter(e => this.selectedCountries.includes(e.country));
    },

    minDay() {
      let minDay = this.myMin(...(this.filteredCovidData.map(e => e.slope.findIndex(f => f > 0)).filter(x => x !== -1)));
      if (isFinite(minDay) && !isNaN(minDay)) {
        return minDay + 1;
      } else {
        return -1;
      }
    },

    regionType() {
      switch (this.selectedRegion) {
        case 'World':
          return 'Countries';
        case 'Australia':
        case 'US':
          return 'States / Territories';
        case 'China':
          return 'Provinces';
        case 'Canada':
          return 'Provinces';
        default:
          return 'Regions';
      }
    },

    layout() {
      return {
        title: 'Trajectory of COVID-19 ' + this.selectedData + ' (' + this.formatDate(this.dates[this.day - 1]) + ')',
        showlegend: false,
        autorange: false,
        xaxis: {
          title: 'Total ' + this.selectedData,
          type: 'linear',
          range: this.linearxrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        yaxis: {
          title: 'New ' + this.selectedData + ' (in the Past Week)',
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
        }
      };
    },

    traces() {

      let showDailyMarkers = this.filteredCovidData.length <= 2;

      // draws grey lines (line plot for each location)
      let trace1 = this.filteredCovidData.map((e, i) => ({
        x: e.cases.slice(0, this.day),
        y: e.slope.slice(0, this.day),
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
        hovertemplate: '%{text}<br>Total ' + this.selectedData + ': %{x:,}<br>Weekly ' + this.selectedData + ': %{y:,}<extra></extra>',
      })
      );

      // draws red dots (most recent data for each location)
      let trace2 = this.filteredCovidData.map((e, i) => ({
        x: [e.cases[this.day - 1]],
        y: [e.slope[this.day - 1]],
        text: e.country,
        name: e.country,
        mode: 'markers+text',
        legendgroup: i,
        textposition: 'center right',
        marker: {
          size: 6,
          color: 'rgba(254, 52, 110, 1)'
        },
        hovertemplate: '%{data.text}<br>Total ' + this.selectedData + ': %{x:,}<br>Weekly ' + this.selectedData + ': %{y:,}<extra></extra>',

      }));

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
          selectedRegion: this.selectedRegion,
        },
        traces: this.traces,
        layout: this.layout,
        config: this.config
      };
    },

    xmax() {
      return Math.max(...this.filteredCases, 50);
    },

    xmin() {
      return Math.min(...this.filteredCases, 50);
    },

    ymax() {
      return Math.max(...this.filteredSlope, 50);
    },

    ymin() {
      return Math.min(...this.filteredSlope);
    },

    filteredCases() {
      return Array.prototype.concat(...this.filteredCovidData.map(e => e.cases)).filter(e => !isNaN(e));
    },

    filteredSlope() {
      return Array.prototype.concat(...this.filteredCovidData.map(e => e.slope)).filter(e => !isNaN(e));
    },

    linearxrange() {
      return [0, Math.round(1.2 * this.xmax)];
    },

    linearyrange() {
      let ymax = Math.max(...this.filteredSlope, 50);
      return [-Math.pow(10, Math.floor(Math.log10(ymax)) - 2), Math.round(1.05 * ymax)];
    },
  },

  data: {

    dataTypes: ['Confirmed Cases', 'Reported Deaths'],

    selectedData: 'Confirmed Cases',

    selectedRegion: 'World',

    day: 7,

    lookbackTime: 7,

    minCasesInCountry: 50,

    dates: [],

    covidData: [],

    countries: countriesOfInterest.map(c => c[0]),

    selectedCountries: countriesOfInterest.map(c => c[0]),

    isHidden: true,

    mySelect: '',

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
