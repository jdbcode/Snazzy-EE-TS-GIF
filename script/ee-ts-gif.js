/*

Copyright 2019 Justin Braaten

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

The drawing tool is a modification from code that was originally 
developed by Gennadii Donchyts. 

*/

var theMap = ui.Map();
ui.root.clear();
 
var ltgeeUI = require('users/emaprlab/public:Modules/LandTrendr-UI.js');  
var lcb = require('users/jstnbraaten/modules:ee-lcb.js'); 


var controlPanel = ui.Panel({
  style: {width: '350px', position: 'top-left'} //, backgroundColor: 'rgba(255, 255, 255, 0)'
});

var colYearsPanel = ltgeeUI.colYearsPanel();
var colDatesPanel = ltgeeUI.colDatesPanel();
// NOTE: let people pick seg index?   var indexSelectPanel = ltgeeUI.indexSelectPanel();
var visSelectPanel = ltgeeUI.visSelectPanel();
visSelectPanel.widgets().get(0).setUrl('https://emaprlab.users.earthengine.app/view/landsat-8-rgb-band-combos');
var fpsPanel = ltgeeUI.fpsPanel();
var drawPolygonPanel = ltgeeUI.drawPolygonPanel();
var drawPolygonBox = drawPolygonPanel.widgets().get(1);
var clearButton = ui.Button({label: 'Clear', style:{stretch: 'horizontal'}});
var clearButtonPanel = ui.Panel([clearButton], null, {shown: false});
var rerunButton = ui.Button({label: 'Rerun', style:{stretch: 'horizontal'}});
var rerunButtonPanel = ui.Panel([rerunButton], null, {shown: false});

var instructionsLabel= ui.Label('Instructions',{fontWeight: 'bold'});
var instructions= ui.Label(
  "This EE App will make an animated GIF from\n"+
  "a Landsat time series that has been smoothed\n"+
  "by LandTrendr spectral-temporal segmentation.\n\n"+
  "1. Set the range of years to animate over\n"+
  "2. Set the date range to composite over\n"+
  "...note that date range can cross the new year\n"+
  "3. Select an RGB/band display combination\n"+
  "4. Set the desired animation frame rate\n"+
  "5. Click 5 points to close a rectangle (go slow)\n"+
  "...be patient after 5th click for feature to register\n"+
  "6. Processing begins, wait a few minutes\n\n"+
  "- Use the 'Clear' button to start over\n"+
  "- Change RGB combo and 'Rerun' on same region\n"+
  "- If a video does not render, try making a\n"+
  "...smaller region and/or zoom out a level\n"
  , {whiteSpace:'pre'}
);
var instructionsPanel = ui.Panel([instructionsLabel,instructions]);

var url = ui.Label({
  value: 'About LandTrendr',
});
url.setUrl('https://emapr.github.io/LT-GEE');

controlPanel.add(colYearsPanel);
controlPanel.add(colDatesPanel);
controlPanel.add(visSelectPanel);
controlPanel.add(fpsPanel);
controlPanel.add(rerunButtonPanel);
controlPanel.add(clearButtonPanel);
controlPanel.add(instructionsPanel);
controlPanel.add(url);

function getlims(geom){
  var coords = ee.List(geom.coordinates().get(0));
  var x = coords.map(function(pt){
    return  ee.List(pt).get(0);
  });
  
  var y = coords.map(function(pt){
    return  ee.List(pt).get(1);
  });
  
  return {
    xmin: ee.Number(x.reduce(ee.Reducer.min())),
    xmax: ee.Number(x.reduce(ee.Reducer.max())),
    ymin: ee.Number(y.reduce(ee.Reducer.min())),
    ymax: ee.Number(y.reduce(ee.Reducer.max()))
  };
}

var plotTheMap = function(){
  var colYrs = ltgeeUI.colYearsGet(colYearsPanel);
  var colDates = ltgeeUI.colDatesGet(colDatesPanel);
  var fps = ltgeeUI.fpsGet(fpsPanel);
  var visSelect = ltgeeUI.visSelectGet(visSelectPanel);
  lcb.setProps({
    startYear: colYrs.startYear,
    endYear: colYrs.endYear,
    startDate: colDates.startDate,
    endDate: colDates.endDate,
    sensors: ['LT05', 'LE07', 'LC08'],
    cfmask: ['cloud', 'shadow', 'snow'],
    harmonizeTo: 'LC08',
    aoi: finalGeom,
    resample: 'bicubic'
  });
  var plan = function(year){
    var col = lcb.sr.gather(year)
      .map(lcb.sr.maskCFmask)
      .map(lcb.sr.harmonize)
      //.map(lcb.sr.resample);
    return lcb.sr.mosaicMedoid(col).select(['B2','B3','B4','B5','B6','B7']);
  };
  var years = ee.List.sequence(lcb.props.startYear, lcb.props.endYear);
  var annualSR = ee.ImageCollection.fromImages(years.map(plan));
  var ltCol;
  var visFun;
  var bnames;
  if(visSelect == 'TCB/TCG/TCW'){
    ltCol = annualSR.map(lcb.sr.addBandTC).select(['B6','TCB','TCG','TCW']);
    visFun = lcb.sr.visParams.visTC;
    bnames = ['TCB','TCG','TCW'];
  } else if(visSelect == 'SWIR1/NIR/RED'){
    ltCol = annualSR.select(['B6','B6','B5','B4'],['B6LT','B6','B5','B4']);
    visFun = lcb.sr.visParams.vis654;
    bnames = ['B6','B5','B4'];
  } else if(visSelect == 'NIR/RED/GREEN'){
    ltCol = annualSR.select(['B6','B5','B4','B3']);
    visFun = lcb.sr.visParams.vis543;
    bnames = ['B5','B4','B3'];
  } else if(visSelect == 'RED/GREEN/BLUE'){
    ltCol = annualSR.select(['B6','B4','B3','B2']);
    visFun = lcb.sr.visParams.vis432;
    bnames = ['B4','B3','B2'];
  } else if(visSelect == 'NIR/SWIR1/RED'){
    ltCol = annualSR.select(['B6','B6','B5','B4'],['B6LT','B6','B5','B4']);
    visFun = lcb.sr.visParams.vis564;
    bnames = ['B5','B6','B4'];
  }
    
  var ltParams = { 
    maxSegments:            10,
    spikeThreshold:         0.9,
    vertexCountOvershoot:   3,
    preventOneYearRecovery: true,
    recoveryThreshold:      0.75,
    pvalThreshold:          0.05,
    bestModelProportion:    0.75,
    minObservationsNeeded:  6,
    timeSeries: ltCol
  };
  var lt = ee.Algorithms.TemporalSegmentation.LandTrendr(ltParams);
  var yearsStr = years.map(function(year){
    return ee.String('yr_').cat(ee.Algorithms.String(year).slice(0,4));
  });
  var r = lt.select([bnames[0]+'_fit']).arrayFlatten([yearsStr]).toShort();
  var g = lt.select([bnames[1]+'_fit']).arrayFlatten([yearsStr]).toShort();
  var b = lt.select([bnames[2]+'_fit']).arrayFlatten([yearsStr]).toShort();
  var rgbList = yearsStr.map(function(year){
    return r.select([year]).addBands(g.select([year])).addBands(b.select([year])).rename(bnames);
  });
  var rgbColLT = ee.ImageCollection(rgbList.flatten()).map(function(img){return img.visualize(visFun)});
  
  var gifParams = {
    crs: 'EPSG:3857',
    framesPerSecond: parseInt(fps),
    region: lcb.props.aoi,
    dimensions: 350,
  };
  //print(rgbColLT.getVideoThumbURL(gifParams));
    
  var thumbLabel = ui.Label('Right-click on animation and select\n"Save image as..." to download.\n\nIf the video does not render, try making a\nsmaller region and/or zoom out a level.', {whiteSpace:'pre'});
  var thumbVid = ui.Thumbnail({image:rgbColLT, params:gifParams, style:{position:'top-center', padding:'0px'}});
  var gistLabel = ui.Label({
    value: 'Make it snazzy with this R Shiny app',
  });
  gistLabel.setUrl('https://jstnbraaten.shinyapps.io/snazzy-ee-ts-gif/');
  
  
  var geomLims = getlims(lcb.props.aoi);
  //var bottomLen = ee.Geometry.LineString([[geomLims.xmin, geomLims.ymin],[geomLims.xmax, geomLims.ymin]]).length();
  
  var lon = ee.Number(lcb.props.aoi.centroid(ee.ErrorMargin(1)).coordinates().get(0)).multiply(100).round().divide(100).getInfo().toString();
  var lat = ee.Number(lcb.props.aoi.centroid(ee.ErrorMargin(1)).coordinates().get(1)).multiply(100).round().divide(100).getInfo().toString();

  var scaleString = ee.String('Width (km): ').cat(ee.Geometry.LineString([[geomLims.xmin, geomLims.ymin],[geomLims.xmax, geomLims.ymin]]).length().divide(1000).multiply(100).round().divide(100)).getInfo();
  var centroidString = '\nCentroid (lon, lat): '+lon+', '+lat;
  var infoString = scaleString+centroidString;
  //var scaleLabel = ui.Label({
  //  value: ,
  //});
  
  //var centroidLabel = ui.Label({
  //  value: '\nCentroid (lon, lat): '+lon+', '+lat,
  //});
  
  var infoLabel = ui.Label({
    value: infoString, style:{whiteSpace:'pre'}
  });
  
  var thumbPanel = ui.Panel([thumbLabel,infoLabel,thumbVid,gistLabel], null, {position:'top-right', padding:'0px'});

  theMap.add(thumbPanel);
  dirty = true;
  rerunButtonPanel.style().set('shown', true);
  clearButtonPanel.style().set('shown', true);
};

rerunButton.onClick(function(){
  theMap.remove(theMap.widgets().get(2));
  plotTheMap();
});

var dirty = false;
clearButton.onClick(function(){
  if(dirty === true){
    theMap.remove(theMap.widgets().get(2));
    theMap.remove(theMap.layers().get(0));
    rerunButtonPanel.style().set('shown', false);
    clearButtonPanel.style().set('shown', false);
    tool = new DrawAreaTool(theMap);
    tool.startDrawing();
    tool.onFinished(function(geometry) {
      drawPolygonBox.setValue(false, false);
      finalGeom = geometry;
      plotTheMap();
    });
  }
});

// https://code.earthengine.google.com/82b08b69bd596ada4747cb4bb7ea9526
var DrawAreaTool = function(map) {
  var drawingToolLayer = ui.Map.Layer({name: 'Area Selection Tool', visParams: {palette:'#4A8BF4', color:'#4A8BF4' }});

  this.map = map;
  this.selection = null;
  this.active = false;
  this.points = [];
  this.area = null;
  
  this.listeners = [];

  var tool = this;
  
  this.initialize = function() {
    this.map.onClick(this.onMouseClick);
    map.layers().set(1, drawingToolLayer);
  };
  
  this.startDrawing = function() {
    this.active = true;
    this.points = [];

    this.map.style().set('cursor', 'crosshair');
    drawingToolLayer.setShown(true);
  };
  
  this.stopDrawing = function() {
    tool.active = false;
    tool.map.style().set('cursor', 'hand');

    if(tool.points.length < 2) {
      return;
    }

    var closedPoints = tool.points.slice(0,-1);
    tool.area = ee.Geometry.Polygon(closedPoints).bounds();
    
    var empty = ee.Image().byte();
    var test = empty.paint({
      featureCollection: ee.FeatureCollection(tool.area),
      color: 1,
      width: 4
    });
  
    drawingToolLayer.setEeObject(test);

    tool.listeners.map(function(listener) {
      listener(tool.area);
    });
  };
  
  this.onMouseClick = function(coords) {
    if(!tool.active) {
      return;
    }
    
    tool.points.push([coords.lon, coords.lat]);

    var geom = tool.points.length > 1 ? ee.Geometry.LineString(tool.points) : ee.Geometry.Point(tool.points[0]);
    drawingToolLayer.setEeObject(geom);
    
    //var l = ee.Geometry.LineString([tool.points[0], tool.points[tool.points.length-1]]).length(1).getInfo();
    //print('l/scale: '+(l / theMap.getScale()).toString());
    //if(tool.points.length > 2 && l / theMap.getScale() < 5) {
    //  tool.stopDrawing();
    //}
    if(tool.points.length > 4) {
      tool.stopDrawing();
    }
  };
  
  this.onFinished = function(listener) {
    tool.listeners.push(listener);
  };
  
  this.initialize();
};

var tool = new DrawAreaTool(theMap);

var finalGeom;
tool.onFinished(function(geometry) {
  drawPolygonBox.setValue(false, false);
  finalGeom = geometry;
  plotTheMap();
});

tool.startDrawing();

drawPolygonBox.onChange(function(checked) {
  if(checked) {
    tool.startDrawing();
  } else {
    tool.stopDrawing();
  }
});

theMap.setOptions('HYBRID');
Map.setControlVisibility(null, null, false, false, false);
ui.root.add(controlPanel);
ui.root.add(theMap);


var emaprLabel = ui.Label({
  value: 'More info',
  style: {position:'bottom-right'} 
});
emaprLabel.setUrl('https://jdbcode.github.io/Snazzy-EE-TS-GIF/');
theMap.add(emaprLabel);


var zoomLevel = ui.Label({
  value: 'Zoom level: 4',
  style: {position:'top-left', color:'red'} 
});
theMap.add(zoomLevel);


theMap.onChangeZoom(function(z,b){
  print(z)
  zoomLevel.setValue('Zoom level: '+z);
  if(z > 10 & z < 15){
    zoomLevel.style().set('color', '#4A8BF4');
  } else{
    zoomLevel.style().set('color', 'red');
  }
  
});



