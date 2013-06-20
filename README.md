# uptime-gadget-tasks

> up.time gadget to display Topologies.

## Getting Started
This gadget is built using Grunt `~0.4.1`.  In order to build it, you'll need to download the [Node Packaging Modules](https://npmjs.org/)

After installing NPM, go to the repository on the commandline and type:
```shell
npm install
```

This will install Grunt and all the dependencies locally.

## Available build tasks
### "compress" task (default)
> Compresses everything in the `src/` folder into `target/TopologyTree.zip`. 

```shell
grunt --target=[desired_output_folder]
```
`--target` flag is optional.  If not specified, output will simply go to a subfolder called `target/` as shown above.

### Maven Deploy and Release tasks
Tasks are provided to deploy to a Maven repository.  See [uptime-gadget-tasks](https://github.com/ikrolo/uptime-gadget-tasks-ivan) for instructions on use.

