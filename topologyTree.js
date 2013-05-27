$(function() {

	var topologyTreeBuilder = new TopologyTreeBuilder();
	var sourceBuilder = new TopologyTreeSourceCreator({
		renderTree : function(source) {
			topologyTreeBuilder.buildTree(source);
		},
		displayError : function() {
			topologyTreeBuilder.displayError();
		}
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
