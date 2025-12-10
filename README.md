![Logo](./assets/SplashScreenshot.png)

# Fetch My Route!
#### Your guide to accessible routes around UMBC 


## Table of Contents
Insert ToC here

## Project Description
#### Abstract
The University of Maryland, Baltimore County, is a public university with a student body of 15 thousand undergraduates (est 2023), and a subset of those students have mobility impairments. While UMBC is an inclusive campus, providing alternate transportation routes for such students, the location of said alternate routes may not be inherently obvious. There exist online maps of the campus for incoming students to plan their routes across the university, as well as guideposts throughout campus, but none highlight the aforementioned alternate routes. 
#### Purpose:
Our project does not reinvent the wheel and utilizes existing technology to provide a map of the UMBC campus, with the target audience being those with mobility impairments. The end result will be in the form of a web application, meaning that (assuming UMBC adopts and hosts our project) anyone will be able to look up our map and find their way around using a cellphone. While the target audience is students unable to use normal routes on campus, our website will be accessible by every student at UMBC. 
	
Although there are existing paper maps of nonstandard routes, procured by the Department of Student Disability Services, there are not enough for every student, and some may get lost. Our solution allows for anyone to access easy navigation through UMBC with nothing but a cell phone and network connection.

#### Features
* Realtime location updated based on custom-made map
* Navigation inside campus buildings
* Estimated time arrival (ETA) for proper timing
* Directions sent to user and updated in realtime
* Easy to Navigate User Interface
* Administrative Dashboard where routes can be added, edited, and deleted in realtime on client maps
* In accordance with all proper privacy practices, as stated by the University of Maryland, Baltimore County Privacy Policy

#### Technologies Used
* Google OAuth API (for logging in)
* Firebase (database & deployment)
* NodeJs, NextJs, Leaflet (UI)
* OpenStreetMap (For rendering the map data)
* Open Source Routing Machine (for live directions)


### Helpful Documentation
#### Use Case Diagram
![Full Use Case Diagram](./front%20end/public/assets/diagrams/use-case/full-directions-use-case.png)

### Entity Relationship Diagram
![ER Diagram](./front%20end/public/assets/diagrams/entity-relation/ER.png)

### High Level Documentation
*These documents show how the system works at a high level. The most comprehensive of all documentation, as well as your first source for questions, is the SRS document. For more specific questions regarding one specific component of this project, additional resources can be found below the SRS.* 

SRS Document: 
System Design Document:
User Interface Design Document: 
Testing Document:

### Sprint Progress
*These Documents show less of the final product's functionality, and instead are a testament of how Fetch My Route! was created from the ground up. Therefore, view these documents not as "how to's" or sources of information, but instead as monthly updates which improve over time.*

Project Proposal Document:
Sprint Report 1:
Sprint Report 2:
Sprint Report 3:



## How to Run the Project
Fetch my Route features 2 main methods of running the project. One can either run it locally or deploy the website to the internet. See below for appropriate instructions depending on use case.
### How to run locally
#### Dependency List

### How to deploy
Due to the limited time circumstances faced in developing this project, this project was deployed using Firebase's website deployment feature. For a more permanent home, it is advices that a domian is officially purchased and hosted through a more reputable source, such as CloudFlare.

## How to Use the Project
Insert How to Use section

## Future Improvements
While the core functionality of the system is intact, there are still a number of bugs to squash and features that would elevate this project from a mere proof-of-concept to a deployable, usable, scalable feature of the UMBC digital infrastructure. Below is a non-exhaustive list of future improvements that would be made to this project, if it were selected by our stakeholders to be adopted by UMBC.

1. Add dog icon as live-location marker
    1.1 Optional: PawPrints only behind dog
2. Give the person an outline so the icon stands out more
3. User cannot save routes if they used "Map Click" to generate it
4. General Scaling needs to be improved on mobile devices
5. NextJS error upon runtime - Map already initialized error
6. Website has some latency on older mobile devices
7. Live location does not work on Linux (may not be an issue)
8. PawPrints are not spaced at regular intervals
9. High Contrast could have higher contrast
10. Many buttons all over webpage - consolidate buttons
11. Users can report blocked routes and send an email notification to Admin with said route outage



## Credits
##### Meet the Team:
Aidan Denham, @pairOfPants 
Alex Marbut, @
Celestine Sumah, @ 
Ethan Michalik @


These four developers have put in exceptional effort to complete this project in a timely manner. The advising UMBC professor on this project, Dr. Samit Shivadekar, may or may not have said 
*"This group went above-and-beyond, exceeded all requirements, and any employers reading this should hire all four of these developers right now!"*

## License
At this point in time, this project is unlicensed. If the University of Maryland, Baltimore County decides to adopt this project, this fact will inevitably change. 


