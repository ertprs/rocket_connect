Structure

This framework is supposed to support multiple incoming and outcomming backends.

For that, there is a Flow Model, that will have inBound, and outBond configurarions, like so:

Flows = [
    {
        "id": "my_flow"
        "inbound": {
            type: "rocketchat",
            url: "http://rocketchat:3000"
        }
    },

]