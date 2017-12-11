const Web3 = require('web3');
const IPFS = require('ipfs-mini');
const json = require('./contract.json');
const snoowrap = require('snoowrap');
var redis = require("redis");

var redisClient = redis.createClient();
// //Reddit config
var redditClient = new snoowrap({
  userAgent: 'Bounties-Network-Bot',
  clientId: process.env.redditclientid,
  clientSecret: process.env.redditclientsecret,
  username: process.env.redditusername,
  password: process.env.redditpassword,
});

//setting this timeout, to avoid reddit's ratelimit exception
redditClient.config({requestDelay: 10000});

function getRedditId(bountyId, cb) {
  redisClient.get(bountyId, function(err, reply) {
    if(err) console.log(`redis error, ${err}`);
    else return cb(reply);
  });
}

function setRedditId(bountyId, redditId, cb) {
  redisClient.set(bountyId.toString(), redditId.toString(), (err)=>{
    return cb();
  });
}

function replyToRedditPost(bountyId, text) {
  getRedditId(bountyId, (redditId)=>{
    if(!redditId) {
      setTimeout(() => {
        return replyToRedditPost(bountyId, text);
      }, 5000);
    } else {
      console.log("replying...");
      redditClient.getSubmission(redditId)
        .reply(text)
    }
  })
}

function addhttps(url) {
  if (!/^(f|ht)tp?:\/\//i.test(url)) {
     url = "https://" + url;
  }
  return url;
}

var web3;
var StandardBounties;
var contractAddress;
if(process.env.network==="rinkeby") {
  web3 = new Web3('wss://rinkeby.infura.io/ws');
  StandardBounties = new web3.eth.Contract(json.interfaces.StandardBounties, json.rinkeby.standardBountiesAddress);
  contractAddress = json.rinkeby.standardBountiesAddress;
} else {
  web3 = new Web3('wss://mainnet.infura.io/ws');
  StandardBounties = new web3.eth.Contract(json.interfaces.StandardBounties, json.mainNet.standardBountiesAddress);
  contractAddress = json.mainNet.standardBountiesAddress;
}

const ipfs = new IPFS({ host: 'ipfs.infura.io', port: 5001, protocol: 'https'});

var event = web3.eth.subscribe('logs', {address: contractAddress,
                                        topics:[
                                          ['0xe04ac09e4a49338f40cf62a51ba721823ed22f57bc4d53c6f8684bdb1be8fd10',
                                          '0xe42c1b76efa2e9aa5b354a151174590827beb1ef94bde26787491bf4e7d68a19',
                                          '0x073d5fd87a7e0c2a384727f9aab2e84826370623aba582638b425a417e799a2c',
                                          '0x0061c78e3c7ddc2b1bfc8ba5996c63dd51b289e6ee3bd6f0e55089cf698aa692',
                                          '0x1b5171f0f6cd238c5b76b002b28e5c29dc3864174e7ed7f168b5e6373196d901',
                                          '0x76a6676aed9f1a70fb8043b568311724b5e4cec1d68ff8fc9d5ab0a6fa619c17',
                                          '0x75aecd8d57cb4b1b263271bddb4961b993924dd466e6003c254832572d8a57e1',
                                          '0xeb70bc86dda3bbb4f37b25318d4737f2641d3e315df2f59a123c5a0619710357',
                                          '0x7b9dbf959e54bb2ff6e9d505ef00d6b7fb3ce97880816181aecca973c1da31e6'
                                        ]]}, function(error, result){
})
.on("data", function(data){
  console.log("got data");
  console.log(data);
  var bountyId;
  try {
    bountyId = web3.utils.hexToNumberString(data.data.substring(0,66));
  } catch(err) {
    console.log(err);
    console.log('error getting bountyId');
  }
  if(bountyId) {
    // this hex is for a new bounty getting created
    if(data.topics[0]==="0xe04ac09e4a49338f40cf62a51ba721823ed22f57bc4d53c6f8684bdb1be8fd10"){
      console.log("creating a new bounty");
      console.log(`getting bounty details from IPFS for bounty:  ${bountyId}`);
      getRedditId(bountyId, (redditId)=>{
        if(!redditId){
          StandardBounties.methods.getBounty(bountyId).call({},(err, bountyDetails)=>{
            StandardBounties.methods.getBountyData(bountyId).call({},(err, ipfsHash)=> {
              ipfs.catJSON(ipfsHash, (err, result)=> {
                console.log(result);
                var text="";
                if(result.description) text+=`### Details : ${result.description}   \n`;
                if(result.categories.length>0) text+=`### Categories: ${result.categories.toString()}   \n`;
                if(result.contact) text+=`### Contact info: ${result.contact}   \n`;
                if(result.githubLink) text+=`[github](${addhttps(result.githubLink)})    \n`;
                if(result.sourceFileName && result.sourceDirectoryHash) text+=`[attached file](https://ipfs.infura.io/ipfs/${result.sourceDirectoryHash}/${result.sourceFileName})    \n`;
                text+=`Deadline is: ${new Date(bountyDetails[1]*1000).toString()}   \n`;
                text+=`[Bounty](https://beta.bounties.network/bounty/${bountyId})`
                redditClient.getSubreddit('bounties')
                .submitSelfpost({title: `New Bounty: ${result.title}`, text: text})
                .then((res)=>{
                    if(res.name) {
                      console.log(res.name);
                      setRedditId(bountyId, res.name, ()=>console.log(`bounty name: ${res.name}`));
                    } else {
                      console.log("error, different structure of api result from reddit");
                      console.log(res);
                    }
                })
                .catch((err)=>{
                    console.log(`error ${err}`);
                })
                
              });
            });
          });
        } else {
            console.log(`error, the new bountyid already exists. bountyId = ${bountyId}`);
        } 
      })
      //this hex is for accepted submission      
    } else if(data.topics[0]==="0x7b9dbf959e54bb2ff6e9d505ef00d6b7fb3ce97880816181aecca973c1da31e6") {
      console.log("accepting a submission");
      const fulfillmentIndex = data.topics[2];
      StandardBounties.methods.getFulfillment(bountyId, fulfillmentIndex).call({},(err, submissionDetail)=>{
        if(err) console.log(`error ${err}`)
        else {
          const ipfsHash = submissionDetail[2];
          ipfs.catJSON(ipfsHash, (err, result)=> {
            if(err) console.log(`error  ${err}`);
            else {
              var text = "A submission to this bounty was accepted    \n";
              if(result.description) text+=`### Details : ${result.description}   \n`;
              if(result.contact) text+=`### Contact info: ${result.contact}   \n`;    
              if(result.sourceFileName && result.sourceDirectoryHash) text+=`[attached file](https://ipfs.infura.io/ipfs/${result.sourceDirectoryHash}/${result.sourceFileName})    \n`;              
              replyToRedditPost(bountyId, text);
            }
          });
        }
      })
    } 
      //this hex is for a new submission    
    else if(data.topics[0]==="0xeb70bc86dda3bbb4f37b25318d4737f2641d3e315df2f59a123c5a0619710357"){
      console.log("adding a new submission to bounty");
      const fulfillmentIndex = data.topics[2];
      StandardBounties.methods.getFulfillment(bountyId, fulfillmentIndex).call({},(err, submissionDetail)=>{
        if(err) console.log(`error ${err}`)
        else {
          const ipfsHash = submissionDetail[2];
          ipfs.catJSON(ipfsHash, (err, result)=> {
            if(err) console.log(`error  ${err}`);
            else {
              var text = "A new submission to the bounty was created    \n";
              if(result.description) text+=`### Details : ${result.description}   \n`;
              if(result.contact) text+=`### Contact info: ${result.contact}   \n`;
              if(result.sourceFileName && result.sourceDirectoryHash) text+=`[attached file](https://ipfs.infura.io/ipfs/${result.sourceDirectoryHash}/${result.sourceFileName})    \n`;
              replyToRedditPost(bountyId, text);
            }
          });
        }
      })
      //this hex is for contributions
    } else if(data.topics[0]==="0x75aecd8d57cb4b1b263271bddb4961b993924dd466e6003c254832572d8a57e1") {
      console.log("contributing to bounty");
      StandardBounties.methods.getBounty(bountyId).call({},(err, bountyDetails)=>{
        //checks if paystoken is true(ECR20 token);otherwise its in ether
        if(bountyDetails[3]){
          const contribution = web3.utils.hexToNumberString(`0x${data.data.substring(66,130)}`);
          const text = `(${contribution} ERC20 Token) was contributed to this bounty`;
          replyToRedditPost(bountyId, text);
        } else {
          const contribution = web3.utils.fromWei(web3.utils.hexToNumberString(`0x${data.data.substring(66,130)}`));
          const text = `(${contribution} Eth) was contributed to this bounty`;
          replyToRedditPost(bountyId, text);
        }
      });
      //this hex is for transfer of bounty ownership
    } else if(data.topics[0]==="0x76a6676aed9f1a70fb8043b568311724b5e4cec1d68ff8fc9d5ab0a6fa619c17") {
      console.log("transferring bounty ownership");
      const text = 'The ownership of this bounty was transfered';
      replyToRedditPost(bountyId, text);
    }
      //this hex is for activating bounties
    else if(data.topics[0]==="0xe42c1b76efa2e9aa5b354a151174590827beb1ef94bde26787491bf4e7d68a19") {
      console.log("activating bounty");
      const text = 'This bounty is activated';
      replyToRedditPost(bountyId, text);
      //this hex is for extending bounties deadline
    } else if(data.topics[0]==="0x073d5fd87a7e0c2a384727f9aab2e84826370623aba582638b425a417e799a2c"){
      console.log("extending bounty deadline");
      const new_deadline = web3.utils.hexToNumberString(`0x${data.data.substring(66,130)}`);
      const text = `Deadline Extended to : ${new Date(new_deadline*1000).toString()}`;
      replyToRedditPost(bountyId, text);
      //this hex is for payout increase
    } else if(data.topics[0]==="0x0061c78e3c7ddc2b1bfc8ba5996c63dd51b289e6ee3bd6f0e55089cf698aa692") {
      console.log("increasing bounty payout");
      StandardBounties.methods.getBounty(bountyId).call({},(err, bountyDetails)=>{
        //checks if paystoken is true(ECR20 token);otherwise its in ether
        if(bountyDetails[3]){
          const new_price_in_eth = web3.utils.hexToNumberString(`0x${data.data.substring(66,130)}`);
          const text = `Payout increase to : (${new_price_in_eth} ECR20 Token)`;
          replyToRedditPost(bountyId, text);
        } else {
          const new_price_in_eth = web3.utils.fromWei(web3.utils.hexToNumberString(`0x${data.data.substring(66,130)}`));
          const text = `Payout increase to : (${new_price_in_eth} Eth)`;
          replyToRedditPost(bountyId, text);
        }
      });
      //this hex is for killed bounty
    } else if(data.topics[0]==="0x1b5171f0f6cd238c5b76b002b28e5c29dc3864174e7ed7f168b5e6373196d901") {
      console.log("killing bounty");
      const text = 'This bounty is dead';
      replyToRedditPost(bountyId, text);
    }
    else {
      console.log("nothing happened");
      console.log(data);
    }  
  }
});
