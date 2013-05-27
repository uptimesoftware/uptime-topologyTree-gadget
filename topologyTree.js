$(function() {

	var topologyTreeBuilder = new TopologyTreeBuilder();
	var sourceBuilder = new TopologyTreeSourceCreator({
		renderTree : topologyTreeBuilder.buildTree,
		displayError : topologyTreeBuilder.displayError
	});

	uptimeGadget.registerOnLoadHandler(function(onLoadData) {
		topologyTreeBuilder.resize(onLoadData.dimensions);
		sourceBuilder.getSource();
	});

	uptimeGadget.registerOnResizeHandler(function(dimensions) {
		topologyTreeBuilder.resize(dimensions);
	});

	$('input[name="showEntireTree"]').change(function() {
		sourceBuilder.rebuildTreeWithCachedResults();
	});

});
