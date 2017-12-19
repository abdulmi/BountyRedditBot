# BountyRedditBot
Reddit bot for https://beta.bounties.network/ for the bounties subreddit at https://reddit.com/r/bounties

## Steps to run the bot : 
### 1- first clone the repo somewhere 
`git clone https://github.com/abdulmi/BountyRedditBot` 
### 2- install the node_modules
`npm install`
### 2- you need to set environment variables for the reddit bot, you can get the first two variables from [reddit](https://www.reddit.com/prefs/apps/) 
`export clientId= *your-client-id*`  
`export clientSecret= *your-client-secret*`  
`export username= *your-client-username*`  
`export password= *your-client-password*`  
if you want to listen to rinkeby test network then set environment variable to rinkeby:   
`export network=rinkeby`  

### 3- run the start script
`npm run start`  
