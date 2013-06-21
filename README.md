# Topology Gadget

> up.time gadget to display Topologies.

## Getting Started
This gadget is built using Grunt `~0.4.1`.

1. Install [Node Packaging Modules](https://npmjs.org/)

2. Go to the repository on the commandline and type:
```shell
npm install -g grunt-cli
```
This will setup Grunt.

3. To download all the dependencies required for the gadget project, type:
```shell
npm install
```

If you run into any issues, please be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide.

## Available build tasks
### "compress" task (default)
> Compresses everything in the `src/` folder into `target/uptime.TopologyTree.zip`. 

```shell
grunt --target=[desired_output_folder]
```
`--target` flag is optional.  If not specified, output will simply go to a subfolder called `target/` as shown above.

### Maven Deploy and Release tasks
Tasks are provided to deploy to a Maven repository.  See [uptime-gadget-tasks](https://github.com/uptimesoftware/uptime-gadget-tasks) for instructions on use.

