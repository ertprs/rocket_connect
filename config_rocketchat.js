const axios = require('axios')
const config = require('./config/config.json');

url_login = config.rocketchat.url + '/api/v1/login/'
url_info = config.rocketchat.url + '/api/info/'
url_settings = config.rocketchat.url + '/api/v1/settings/'
url_livechat_agent = config.rocketchat.url + '/api/v1/livechat/users/agent'
url_livechat_manager = config.rocketchat.url + '/api/v1/livechat/users/manager'
url_livechat_department = config.rocketchat.url + '/api/v1/livechat/department'
url_users_create = config.rocketchat.url + '/api/v1/users.create'

payload = {
    user: config.rocketchat.admin_user,
    password: config.rocketchat.admin_password
}


departments_payloads = [
    {
        "department": {
            "enabled": true,
            "showOnRegistration": true,
            "email": "email@email.com",
            "showOnOfflineForm": false,
            "showOnRegistration": true,
            "name": "DepartmentA",
            "description": "created from api"
        },
        "agents": [{
            "username": "debug",
            "count": 0,
            "order": 0
        }]
    },
    {
        "department": {
            "enabled": true,
            "showOnRegistration": true,
            "email": "email@email.com",
            "showOnOfflineForm": false,
            "showOnRegistration": true,
            "name": "DepartmentB",
            "description": "created from api"
        },
        "agents": [{
            "username": "debug",
            "count": 0,
            "order": 0
        }]
    }
]


///
//SERVER INFO
///

console.log("ROCKET CONFIG", config.rocketchat)

axios.get(
    url_info
).then(
    response => {
        console.log("ROCKET INFO", response.data)
    },
    error => {
        console.log(error)
    }
)

axios.post(url_login, payload).then(
    (response) => {
        token = response.data.data.authToken
        userId = response.data.data.userId

        headers = {
            "X-Auth-Token": token,
            "X-User-Id": userId
        }
        let config_axios = {
            headers: headers
        }

        //
        // SETTINGS
        //

        settings = [
            ["Show_Setup_Wizard", "completed"],
            ["Log_Level", "2"],
            ["Livechat_enabled", true],
            ["Livechat_request_comment_when_closing_conversation", false],
            ["Livechat_webhookUrl", "http://wapi:3001/rocketchat"],
            ["Livechat_secret_token", config.rocketchat.secret_token],
            ["Livechat_webhook_on_start", true],
            ["Livechat_webhook_on_close", true],
            ["Livechat_webhook_on_agent_message", true]
            ["Site_Url", "http://rocketchat:3000"]
        ]
        for (s in settings) {
            axios.post(
                url_settings + settings[s][0],
                { value: settings[s][1] },
                config_axios
            ).then(
                (res) => {
                    console.log("SETTINGS: ", res.config.url, res.config.data)
                },
                (err) => {
                    console.log(err.config.headers)
                }
            )
        }

        //
        // user as agent
        //
        axios.post(
            url_livechat_agent,
            { "username": config.rocketchat.admin_user },
            config_axios
        ).then(
            (res) => {
                console.log(res.config.url, res.config.data)
            }
        )

        //
        // user as manager
        //
        axios.post(
            url_livechat_manager,
            { "username": config.rocketchat.admin_user },
            config_axios
        ).then(
            (res) => {
                console.log(res.config.url, res.config.data)
            }
        )

        //
        // create departments if not exists
        //
        axios.get(
            url_livechat_department,
            config_axios
        ).then(
            (res) => {
                if (res.data.count == 0) {
                    departments_payloads.map(department => {
                        axios.post(
                            url_livechat_department,
                            department,
                            config_axios
                        ).then(
                            (res) => {
                                console.log(res.config.url, res.config.data)
                            },
                            (err) => {
                                console.log(err)
                            }
                        )

                    })
                }
            }
        )

        // create agents and bot
        agents = [
            {
                "username": "agent1",
                "password": "agent1"
            },
            {
                "username": "agent2",
                "password": "agent2"
            },
            {
                "username": config.rocketchat.bot_username,
                "password": config.rocketchat.bot_password
            }
        ]
        agents.map(agent => {
            axios.post(
                url_users_create,
                { "name": agent.username, "email": agent.username + "@user.tld", "password": agent.password, "username": agent.username },
                config_axios
            ).then(
                res => {
                    console.log(res.data)
                    // add as agent
                    if(agent.username != config.rocketchat.bot){
                        axios.post(
                            url_livechat_agent,
                            { "username": agent.username },
                            config_axios
                        ).then(
                            (res) => {
                                console.log(res.config.url, res.config.data)
                            }
                        )
                    }
                    // create department with agents

                },
                err => {
                    console.log("did not created " + agent.name)
                    console.log("err " + err)
                }
            )


        })

    },
    (error) => { console.log(error) },
)