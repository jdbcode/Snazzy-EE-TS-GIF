# Copyright 2019 Justin Braaten
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


library(magick)
library(ggplot2)
library(rnaturalearth)
library(shiny)
library(gifski)
library(rgeos)
library(shinycssloaders)

ui = fluidPage(
  
  titlePanel("Snazzy EE-TS-GIF"),
  
  fluidRow(
    
    column(5,
           wellPanel(
             fluidRow(
                      p("This app will annotate years and add a context map to GIFs created by the", 
                        a(href="https://emaprlab.users.earthengine.app/view/lt-gee-time-series-animator", "LandTrendr time series animation app."),
                        "More info", a(href="https://jdbcode.github.io/Snazzy-EE-TS-GIF/", "here.")),
                      p("1) Make GIF using above linked app" ,br(),
                        "2) Upload the GIF here" ,br(),
                        "3) Alter inputs according to info printed in above linked app" ,br(),
                        "4) Click the 'Submit' button" ,br(),
                        "5) Right click resulting GIF to download",br(),
                        "* Alter inputs and resubmit as needed"),
                      
                      fileInput("fn", "Upload GIF file",
                         multiple = FALSE,
                         accept = c('.gif'))
             ),
             fluidRow(column(6, textInput('startYear', 'Start year', value='1984')),
                      column(6, textInput('endYear', 'End year', value='2019'))
             ),
             fluidRow(column(6, textInput('lon', 'Longitude', value='-114.8')),
                      column(6, textInput('lat', 'Latitude', value='50.17'))
             ),
             fluidRow(column(6, textInput('scale', 'Width (km)', value='31.22')),
                      column(6, textInput('delay', 'Frame delay (seconds)', value='0.01'))
             ),
             fluidRow(column(6, checkboxInput("addMap", "Add map", FALSE)),
                      column(6, checkboxInput("bigger", "Make bigger", FALSE))
             ),
             fluidRow(column(6, checkboxInput("despeckle", "Despeckle", FALSE)),
                      column(6, checkboxInput("fwdbck", "Append reverse", FALSE))
             ),
             fluidRow(column(12, actionButton('go','Submit'))
             )
           )       
    ),
    column(7,
           imageOutput("gif", height = 450) %>% withSpinner(color="#1A91DA")
    )
  )
)

# Define server logic required to draw a histogram
server = function(input, output) {
  
  annotateImg = function(img, scale, year){
    img = image_draw(img, antialias = T)
    imgInfo = image_info(img)
    width = imgInfo$width
    height = imgInfo$height
    meterPerPixel = (scale*1000)/width
    
    intervals = c(2,5,10,50,100)*1000
    lengths = intervals*5
    offsets = c(35,35,42,42,49)
    labels = c("2 km", "5 km", "10 km", "50 km", "100 km")
    df = data.frame(intervals,lengths,offsets,labels, stringsAsFactors = F)
    dif = abs((scale*1000) - df$lengths)
    df = df[order(dif),]
    thisRow = 1
    barLengthPixels = round(df$intervals[thisRow]/meterPerPixel)
    
    leftMargin = 8
    bottomMargin = 8
    barHeight = 6
    containerMargin = 4

    rect(leftMargin-containerMargin, height-bottomMargin+containerMargin, leftMargin+barLengthPixels+df$offsets[thisRow], height-(barHeight+bottomMargin)-containerMargin, col = rgb(0,0,0,0.4), border = rgb(0,0,0,alpha=0.0), lwd = 0) #col = rgb(0,0,0,alpha=alpha) 
    rect(leftMargin, height-bottomMargin, leftMargin+barLengthPixels, height-(barHeight+bottomMargin), col = "#E5E4E5", border = "#E5E4E5", lwd = 0) 
    text(x = (leftMargin+barLengthPixels+5), y = (height-(barHeight+bottomMargin)+4.5), adj = 0, label = df$labels[thisRow], font = 1, cex=1, family = "sans", col = "#E5E4E5")
    rect(width-60, height, width, height-24, col=rgb(0,0,0,0.4), border = rgb(0,0,0,alpha=0.0), lwd = 0)
    text(width-52, height-9, as.character(year), family = "helvetica", cex = 1.7, pos=4, offset=0, col='white')
    
    rect(width-108, 15, width, 0, col=rgb(0,0,0,0.4), border = rgb(0,0,0,alpha=0.0), lwd = 0)
    text(width-103, 8, 'bit.ly/snazzy-ee-ts-gif', family = "sans", cex = 0.9, pos=4, offset=0, col='white')
    
    dev.off()
    return(img)
  }

  addMapFun = function(frames, centroid){
    width = image_info(frames[1])$width
    fig = image_graph(width = width, height=500, res = 72)
    world = ne_countries(scale = "small", returnclass = "sf")
    site = sf::st_as_sf(data.frame(longitude=centroid[1] ,latitude=centroid[2]), coords = c("longitude", "latitude"), crs = 4326)
    ymin = max(c(-90, centroid[2] -27))
    ymax = min(c(90, centroid[2] + 27))
    par(mar = rep(0, 4))
    p = ggplot() +
      geom_sf(data = world) +
      geom_sf(data = site, size=3.5, color="black") +
      coord_sf(ylim=c(ymin, ymax)) +
      theme(axis.title = element_blank(),
            axis.text = element_blank(),
            axis.ticks = element_blank(),
            panel.background = element_rect(fill = "grey"),
            panel.grid.major = element_line(colour = 'transparent'),
            plot.margin = unit(c(0, 0, 0, 0), "null"))
    print(p)
    map = image_trim(image_capture())
    dev.off()
    
    gap = image_blank(width, 2, color = "#505050", pseudo_image = "")

    nframes = nrow(image_info(frames))
    for(i in 1:nframes){
      img = image_append(c(frames[i], gap, map), stack=T)
      frames[i] = img
    }
    return(frames)
  }
  
  animation = eventReactive(input$go, {  
    isolate({file = input$fn$datapath
    startYear = as.numeric(input$startYear)
    endYear = as.numeric(input$endYear)
    despeckle = input$despeckle #'yes'
    bigger = input$bigger #'yes'
    fwdbck = input$fwdbck
    scale = as.numeric(input$scale)
    addMap = input$addMap #'yes'
    centroid = c(as.numeric(input$lon), as.numeric(input$lat))})
    
    yearRange = seq(startYear, endYear)
    forward = image_read(file) %>%
      image_trim()
    
    nframes = nrow(image_info(forward))

    filled = c(forward[1])
    comp = forward[1]
    for(i in 2:nframes){
      comp = image_composite(comp,forward[i])
      filled = c(filled, comp)
    }
    
    if(despeckle){
      filled = filled %>% 
        image_despeckle(1) %>%
        image_blur(radius = 1, sigma = 0.2)
    }
    
    if(bigger){
      scaleIt = "425"
      if(image_info(filled[1])$height > image_info(filled[1])$width) scaleIt = "x425"
      filled = image_scale(filled, scaleIt)
    }
    
    for(i in 1:nframes){
      filled[i] = annotateImg(filled[i], scale, as.character(yearRange[i]))
    }
    
    if(addMap){
      filled = addMapFun(filled, centroid)
    }
    
    # add sources
    box = image_blank(image_info(filled[1])$width, 15, color = "#505050", pseudo_image = "") %>%
      image_annotate(' Earth Engine + Landsat + LandTrendr', size = 11, color = "#E5E4E5", gravity = "southeast", font="sans") #, boxcolor = rgb(0,0,0,0.4
    for(i in 1:nframes){
      img = image_append(c(filled[i], box), stack=T)
      filled[i] = img
    }
    
    final = image_border(filled, "#505050", "3x3")
    
    if(fwdbck){
      final = c(final, rev(final))
    }
    
    return(final)
  })
  
  output$gif = renderImage({
    outfile = tempfile(fileext = ".gif")
    image_write_gif(animation(), outfile, delay=isolate(as.numeric(input$delay)))
    list(src = outfile, contentType = "image/gif")
  })
}

# Run the application 
shinyApp(ui = ui, server = server)
