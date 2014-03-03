TopologyTreeBuilder = function(userOptions) {
	var options = $.extend({
		refreshInterval : 30 * 1000,
		errorHandler : undefined,
		okHandler : undefined
	}, userOptions);

	if (typeof options.refreshInterval != "number" || options.refreshInterval < 0) {
		throw new TypeError("refreshInterval must be a positive number or zero to disable");
	}
	if (typeof options.errorHandler != "undefined" && typeof options.errorHandler != "function") {
		throw new TypeError("errorHandler must be a function");
	}

	var rootColumnWidth = 60;
	var minColumnWidth = 120;
	var minRowHeight = 12;
	var charWidth = 8;

	var viewportDimensions = new UPTIME.pub.gadgets.Dimensions(100, 100);
	var minCanvasDimensions = getCanvasDimensions(1, 1);
	var canvasDimensions = $.extend({}, minCanvasDimensions);

	var transitionDuration = 500;

	var textPadding = 4;
	var expandedRadius = 4;
	var minContractedRadius = 6;
	var maxContractedRadius = 24;
	var massiveNodeRadius = 36;

	var userSettingsKey = "uptime.TopologyTree." + uptimeGadget.getInstanceId();
	var userSettings = loadSettings();

	function loadSettings() {
		var defaultSettings = {
			expansions : {},
			zoom : 1.0
		};
		if (window.localStorage) {
			var userSettingsJson = window.localStorage.getItem(userSettingsKey);
			try {
				return $.extend(defaultSettings, JSON.parse(userSettingsJson));
			} catch (e) {
			}
		}
		return defaultSettings;
	}

	function saveSettings() {
		if (window.localStorage) {
			if (userSettings.expansions.length == 0 && userSettings.zoom == 1.0) {
				window.localStorage.removeItem(userSettingsKey);
			} else {
				window.localStorage.setItem(userSettingsKey, JSON.stringify(userSettings));
			}
		}
	}

	function getExpansion(node) {
		return userSettings.expansions[node.elementId];
	}

	function setExpansion(node, expansion) {
		if (expansion) {
			userSettings.expansions[node.elementId] = expansion;
		} else {
			delete userSettings.expansions[node.elementId];
		}
	}

	function translateYX(d) {
		return "translate(" + d.y + "," + d.x + ")";
	}

	function projectYX(d) {
		return [ d.y, d.x ];
	}

	function oldXY(d) {
		return {
			x : d.oldX,
			y : d.oldY
		};
	}

	var rootNode = null;
	var refreshableNodes = {};
	var refreshTimeoutId = null;

	var currNodeId = 0;
	var tree = d3.layout.tree().size(getTreeSize(1)).children(getChildren).sort(function(a, b) {
		return naturalSort(a.elementName, b.elementName);
	}).separation(function(a, b) {
		var normalSeparation = a.parent == b.parent ? 1 : 2;
		var extraSeparation = getRadius(a) * 2 + getRadius(b) * 2 - minRowHeight * 2;
		if (extraSeparation > 0) {
			return normalSeparation + extraSeparation / minRowHeight;
		}
		return normalSeparation;
	});

	var vis = d3.select("#treeContainer").append("svg:svg").attr("id", "treeCanvas").attr("width",
			canvasDimensions.width * userSettings.zoom).attr("height", canvasDimensions.height * userSettings.zoom).attr(
			"viewBox", "0 0 " + canvasDimensions.width + " " + canvasDimensions.height).append("svg:g").attr("transform",
			"translate(" + rootColumnWidth + "," + minRowHeight + ")");

	this.resize = function(dimensions) {
		updateViewportSize(dimensions);
		if (rootNode == null) {
			updateCanvasSize(dimensions);
			tree.size(getTreeSize(1));
		} else {
			// updateTree() will internally update canvas size where needed
			updateTree(rootNode);
		}
	};

	this.buildTree = function(source) {
		var firstBuild = false;
		if (rootNode == null) {
			source.oldX = tree.size()[0] / 2;
			source.oldY = 0;
			firstBuild = true;
		} else {
			source.oldX = rootNode.x;
			source.oldY = rootNode.y;
		}
		if (refreshTimeoutId != null) {
			clearTimeout(refreshTimeoutId);
			refreshTimeoutId = null;
		}
		refreshableNodes = {};
		rootNode = source;
		rootColumnWidth = Math.min(getRadius(rootNode) + textPadding + rootNode.elementName.length * charWidth, minColumnWidth);
		vis.attr("transform", "translate(" + rootColumnWidth + "," + minRowHeight + ")");
		updateTree(rootNode, firstBuild);
		scheduleNextRefresh();
	};

	this.zoomIn = function() {
		userSettings.zoom *= 1.1;
		saveSettings();
		d3.select("#treeCanvas").attr("width", canvasDimensions.width * userSettings.zoom).attr("height",
				canvasDimensions.height * userSettings.zoom);
	};

	this.zoomOut = function() {
		userSettings.zoom /= 1.1;
		saveSettings();
		d3.select("#treeCanvas").attr("width", canvasDimensions.width * userSettings.zoom).attr("height",
				canvasDimensions.height * userSettings.zoom);
	};

	this.zoomReset = function() {
		userSettings.zoom = 1.0;
		saveSettings();
		d3.select("#treeCanvas").attr("width", canvasDimensions.width * userSettings.zoom).attr("height",
				canvasDimensions.height * userSettings.zoom);
	};

	function scheduleNextRefresh() {
		if (options.refreshInterval > 0) {
			refreshTimeoutId = setTimeout(refreshTree, options.refreshInterval);
		}
	}

	function createElementFilter(nodeMultimap) {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements/filter", {
			type : 'POST',
			contentType : 'application/json',
			data : JSON.stringify({
				ids : $.map(nodeMultimap, function(nodes, elementId) {
					return elementId;
				})
			}),
			processData : false,
			dataType : 'json'
		}).done(function(data, textStatus, jqXHR) {
			deferred.resolve(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
		});
		return deferred.promise;
	}

	function refreshTree() {
		refreshTimeoutId = null;
		if (Object.keys(refreshableNodes).length == 0) {
			scheduleNextRefresh();
			return;
		}
		var nodeMultimap = {};
		$.each(refreshableNodes, function(i, node) {
			if (typeof nodeMultimap[node.elementId] == "undefined") {
				nodeMultimap[node.elementId] = [];
			}
			nodeMultimap[node.elementId].push(node);
		});
		createElementFilter(nodeMultimap).then(function(filter) {
			return refreshElementStatus(filter, nodeMultimap);
		}).then(options.okHandler, options.errorHandler).then(scheduleNextRefresh);
	}

	function refreshElementStatus(filter, nodeMultimap) {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements/filter/" + filter.id + "/status", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			$.each(data, function(i, status) {
				if ((typeof nodeMultimap[status.id] != "undefined") && (status.isMonitored)) {
					$.each(nodeMultimap[status.id], function(j, node) {
						updateNodeStatus(node, status);
					});
					delete nodeMultimap[status.id];
				}
			});
			// delete statuses we asked for but didn't get back
			$.each(nodeMultimap, function(i, nodes) {
				$.each(nodes, function(j, node) {
					updateNodeStatus(node);
				});
			});
			deferred.resolve(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
		});
		return deferred.promise;
	}

	function updateNodeStatus(node, elementStatus) {
		if (!elementStatus) {
			return removeNode(node);
		} else if (node.parent && node.parent.elementId) {
			// if we were removed from the topology...
			if ($.grep(elementStatus.topologyParentStatus, function(topologyParentStatus) {
				return topologyParentStatus.id == node.parent.elementId;
			}).length == 0) {
				return removeNode(node);
			}
		}
		node.elementStatus = elementStatus.status;
		node.statusMessage = elementStatus.message;
		node.monitorStatus = $.map(elementStatus.monitorStatus, function(monitorStatus) {
			return monitorStatus.isHidden ? undefined : {
				id : monitorStatus.id,
				name : monitorStatus.name,
				status : monitorStatus.status
			};
		}).sort(function(a, b) {
			return naturalSort(a.name, b.name);
		});
		d3.select("#topologyTreeNode_" + node.id).attr("class", getNodeClass(node));
		return node;
	}

	this.reset = function() {
		if (rootNode != null) {
			$.each(resetExpansions(rootNode, null), function(i, updateNode) {
				updateTree(updateNode);
			});
			scrollToNode(rootNode);
			saveSettings();
		}
	};

	this.expandAll = function() {
		if (rootNode != null) {
			$.each(resetExpansions(rootNode, "full"), function(i, updateNode) {
				updateTree(updateNode);
			});
			scrollToNode(rootNode);
			saveSettings();
		}
	};

	function resetExpansions(node, value) {
		if (!node.hasChildren) {
			return [];
		}
		var toUpdate = [];
		$.each(node.branches, function(i, child) {
			$.merge(toUpdate, resetExpansions(child, value));
		});
		if (getExpansion(node) == value) {
			return toUpdate;
		}
		setExpansion(node, value);
		removeD3Children(node);
		return [ node ];
	}

	function updateViewportSize(dimensions) {
		viewportDimensions = $.extend({}, dimensions);
	}

	function updateCanvasSize(dimensions) {
		canvasDimensions = new UPTIME.pub.gadgets.Dimensions(Math.max(dimensions.width, minCanvasDimensions.width), Math.max(
				dimensions.height, minCanvasDimensions.height));
		d3.select("#treeCanvas").attr("width", canvasDimensions.width * userSettings.zoom).attr("height",
				canvasDimensions.height * userSettings.zoom).attr("viewBox",
				"0 0 " + canvasDimensions.width + " " + canvasDimensions.height);
	}

	function updateTree(actionNode) {
		// tell D3 to rebuild .parent, .children, .depth, .x and .y
		var treeNodes = tree.nodes(rootNode).reverse();

		// try to resize the tree to avoid node and label collisions
		treeNodes = autoResizeCanvasAndTree(treeNodes);

		// select the visible nodes/links and make sure they have unique ids
		var visibleNodes = getVisibleNodes(treeNodes);
		var visibleLinks = getVisibleLinks(treeNodes);

		// enter/update/exit nodes with animation
		createNewNodes(visibleNodes, visibleLinks, actionNode);
		updateExistingNodes(visibleNodes, visibleLinks);
		removeExitingNodes(visibleNodes, visibleLinks, actionNode);
		storeOldNodePositions(treeNodes);
	}

	function getVisibleNodes(treeNodes) {
		var newNodes = {};
		var visibleNodes = vis.selectAll("g.node").data(treeNodes, function(node) {
			if (!node.id) {
				node.id = ++currNodeId;
				if (node.elementId) {
					newNodes[node.id] = node;
				}
			}
			return node.id;
		});
		addToRefreshableNodes(newNodes);
		return visibleNodes;
	}

	function addToRefreshableNodes(nodes) {
		if (nodes.length == 0) {
			return;
		}
		var nodeMultimap = {};
		$.each(nodes, function(i, node) {
			if (!refreshableNodes[node.id]) {
				refreshableNodes[node.id] = node;
				if (typeof nodeMultimap[node.elementId] == "undefined") {
					nodeMultimap[node.elementId] = [];
				}
				nodeMultimap[node.elementId].push(node);
			}
		});
		if (Object.keys(nodeMultimap).length > 0) {
			createElementFilter(nodeMultimap).then(function(filter) {
				return refreshElementStatus(filter, nodeMultimap);
			});
		}
	}

	function getVisibleLinks(treeNodes) {
		return vis.selectAll("path.link").data(tree.links(treeNodes), function(link) {
			return link.source.id + '.' + link.target.id;
		});
	}

	function storeOldNodePositions(treeNodes) {
		treeNodes.forEach(function(node) {
			node.oldX = node.x;
			node.oldY = node.y;
		});
	}

	function autoResizeCanvasAndTree(treeNodes) {
		var treeHeight = 1;
		var treeWidth = 1;
		var treeWidthsByDepth = {};
		treeNodes.forEach(function(node) {
			if (treeHeight < node.depth + 1) {
				treeHeight = node.depth + 1;
			}
			// This hacky breadth calculation assumes 1 leaf = 1 fully expanded
			// branch = 1 row and everything else is 2.
			// NB: this breaks if you have an unbalanced tree with oddly-
			// separated clusters
			if (typeof treeWidthsByDepth[node.depth] == "undefined") {
				treeWidthsByDepth[node.depth] = 0;
			}
			treeWidthsByDepth[node.depth]++;
			if (node.hasChildren && getExpansion(node) != "full") {
				treeWidthsByDepth[node.depth]++;
			}
			if (treeWidth < treeWidthsByDepth[node.depth]) {
				treeWidth = treeWidthsByDepth[node.depth];
			}
		});

		var newCanvasDimensions = getCanvasDimensions(treeHeight, treeWidth);
		if (newCanvasDimensions.width != canvasDimensions.width || newCanvasDimensions.height != canvasDimensions.height) {
			updateCanvasSize(newCanvasDimensions);
		}

		var oldTreeSize = tree.size();
		var newTreeSize = getTreeSize(treeHeight);
		if (oldTreeSize[0] != newTreeSize[0] || oldTreeSize[1] != newTreeSize[1]) {
			tree.size(newTreeSize);
			var xTranslate = newTreeSize[0] / oldTreeSize[0];
			var yTranslate = newTreeSize[1] / oldTreeSize[1];
			treeNodes.forEach(function(node) {
				node.x = Math.floor(node.x * xTranslate);
				node.y = Math.floor(node.y * yTranslate);
			});
		}

		return treeNodes;
	}

	// height and width in nodes, returns pixels (viewportDimensions must be
	// set)
	function getCanvasDimensions(treeHeight, treeWidth) {
		return new UPTIME.pub.gadgets.Dimensions(Math
				.max(rootColumnWidth + treeHeight * minColumnWidth, viewportDimensions.width), Math.max(treeWidth * minRowHeight,
				viewportDimensions.height));
	}

	// height in nodes, returns pixels (canvasDimensions must be set)
	function getColumnWidth(treeHeight) {
		return Math.max(Math.floor((canvasDimensions.width - rootColumnWidth) / treeHeight), minColumnWidth);
	}

	// height in nodes, returns pixels (canvasDimensions must be set)
	function getTreeSize(treeHeight) {
		return [ Math.max(canvasDimensions.height - minRowHeight * 2, 1),
				Math.max(canvasDimensions.width - rootColumnWidth - getColumnWidth(treeHeight), 1) ];
	}

	function scrollToNode(node) {
		var treeContainer = $("#treeContainer");
		var scrollTop = treeContainer.scrollTop();
		var scrollLeft = treeContainer.scrollLeft();
		if (canvasDimensions.height > viewportDimensions.height) {
			if (node.x > scrollTop + viewportDimensions.height - minRowHeight * 5 || scrollTop > node.x + minRowHeight * 5) {
				scrollTop = Math.min(Math.max(node.x - viewportDimensions.height / 2, 0), canvasDimensions.height
						- viewportDimensions.height);
			}
		}
		if (canvasDimensions.width > viewportDimensions.width) {
			scrollLeft = Math.min(Math.max(node.y - viewportDimensions.width / 3, 0), canvasDimensions.width
					- viewportDimensions.width);
		}
		treeContainer.animate({
			scrollTop : scrollTop,
			scrollLeft : scrollLeft
		}, transitionDuration);
	}

	function getChildren(node) {
		if (!node.hasChildren || !hasVisibleChildren(node)) {
			return [];
		}
		var children = $.merge([], node.branches);
		if (getExpansion(node) == "full") {
			return $.merge(children, node.leaves);
		}
		return children;
	}

	function getFillColor(node) {
		if (!node.elementId) {
			return "black";
		}
		switch (node.elementStatus) {
		case "CRIT":
			return "#B61211";
		case "WARN":
			return "#DAD60B";
		case "OK":
			return "#67B10B";
		case "MAINT":
			return "#555B98";
		case "UNKNOWN":
		default:
			return "#E6E6E6";
		}
	}

	function getRadius(node) {
		var r = expandedRadius;
		var expansion = getExpansion(node);
		if (node.hasChildren && expansion != "full") {
			if (expansion == "none") {
				r = minContractedRadius + (node.branches.length + node.leaves.length) * 0.1;
			} else if (node.leaves.length > 0) {
				r = minContractedRadius + node.leaves.length * 0.1;
			}
			if (r > maxContractedRadius) {
				r = massiveNodeRadius;
			}
		}
		return r;
	}

	function toggleExpansion(node) {
		if (!node.elementId || !node.hasChildren) {
			return;
		}
		removeD3Children(node);
		var expansion = getExpansion(node);
		// for grandparents: null -> full -> none -> etc (null means partial)
		// for parents: null -> full -> etc (null means none)
		if (expansion == "full") {
			setExpansion(node, (node.branches.length > 0 && node.leaves.length > 0) ? "none" : null);
		} else if (expansion == "none") {
			setExpansion(node, (node.branches.length > 0 && node.leaves.length > 0) ? null : "full");
		} else {
			setExpansion(node, "full");
		}
		saveSettings();
		updateTree(node);
		scrollToNode(node);
	}

	function removeNode(node) {
		delete refreshableNodes[node.id];
		delete node.elementStatus;
		delete node.statusMessage;
		delete node.monitorStatus;
		removeD3Children(node);
		d3.select("#topologyTreeNode_" + node.id).attr("class", getNodeClass(node));
		if (!node.parent) {
			// if node.parent hasn't been set, that means D3 hasn't rendered the
			// node into its tree, just return and hope that it'll fix itself on
			// the next expansion of this node's parent
			return;
		}
		if (node.hasChildren) {
			node.parent.branches = $.grep(node.parent.branches, function(branch) {
				return branch != node;
			});
			if (hasVisibleChildren(node.parent)) {
				removeD3Children(node.parent);
				updateTree(node.parent);
			}
		} else {
			node.parent.leaves = $.grep(node.parent.leaves, function(leaf) {
				return leaf != node;
			});
			if (getExpansion(node.parent) == "full") {
				removeD3Children(node.parent);
				updateTree(node.parent);
			}
		}
	}

	function removeD3Children(node) {
		// removes D3's "children" array so we can call updateTree() to rebuild
		// it based on the expansion setting
		if (node.hasChildren && node.children) {
			$.each(node.children, function(i, child) {
				removeD3Children(child);
				delete refreshableNodes[child.id];
			});
			delete node.children;
		}
	}

	function redirectToElementProfilePage(node) {
		if (!node.elementId) {
			return;
		}
		var url = uptimeGadget.getElementUrls(node.elementId, node.elementName);
		window.top.location.href = url.services;
	}

	function showStatusDetail(node) {
		if (!node.elementId) {
			return;
		}
		var div = d3.select("#tooltip");
		div.transition().duration(transitionDuration).style("opacity", 1).style("border-color", getFillColor(node));
		div.html(constructMessage(node)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");

		highlightPath(node);
	}

	function constructMessage(node) {
		var message = '<ul class="tooltipDetail">';
		message += '<li><span class="tooltipDetailTitle">Element Name:</span><span>' + node.elementName + '</span></li>';
		if (node.elementStatus) {
			message += '<li><span class="tooltipDetailTitle">Element Status:</span><span>' + node.elementStatus + '</span></li>';
		}
		if (node.statusMessage) {
			message += '<li><span class="tooltipDetailTitle">Status Message:</span><span>' + node.statusMessage + '</span></li>';
		}
		message += '<li><span class="tooltipDetailTitle">Element Type:</span><span>' + node.elementType + '</span></li>';
		if (node.monitorStatus && node.monitorStatus.length > 0) {
			message += '<li class="separator"></li>';
			$.each(node.monitorStatus, function(i, monitorStatus) {
				message += '<li><span class="tooltipDetailTitle">' + monitorStatus.name + ':</span><span>' + monitorStatus.status
						+ '</span></li>';
			});
		}
		message += '</ul>';
		return message;
	}

	function hideStatusDetail(node) {
		var div = d3.select("#tooltip");
		div.transition().duration(transitionDuration).style("opacity", 1e-6);

		unhighlightPath(node);
	}

	function highlightPath(node) {
		var eligibleTargets = getEligibleTargetIds(node);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColor(node);
			}
		});
	}

	function unhighlightPath(node) {
		vis.selectAll(".link").style("stroke", null);
	}

	function getEligibleTargetIds(node) {
		var eligibleIds = [];
		eligibleIds.push(node.id);
		if (node.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(node.parent));
		}
		return eligibleIds;
	}

	function removeExitingNodes(visibleNodes, visibleLinks, actionNode) {
		var removedNodes = visibleNodes.exit().transition().duration(transitionDuration).attr("transform", function(node) {
			return translateYX(actionNode);
		}).remove();
		removedNodes.select("circle").attr("r", 1e-6);
		removedNodes.select("text").style("fill-opacity", 1e-6);
		visibleLinks.exit().transition().duration(transitionDuration).attr("d",
				d3.svg.diagonal().source(actionNode).target(actionNode).projection(projectYX)).remove();
	}

	function updateExistingNodes(visibleNodes, visibleLinks) {
		var updatedNodes = visibleNodes.transition().duration(transitionDuration).attr("transform", translateYX);
		updatedNodes.select("circle").attr("r", getRadius);
		updatedNodes.select("text").attr("text-anchor", function(node) {
			return hasVisibleChildren(node) ? "end" : "start";
		}).attr("x", function(node) {
			var offset = textPadding + getRadius(node);
			return hasVisibleChildren(node) ? -offset : offset;
		}).style("fill-opacity", 1);
		visibleLinks.transition().duration(transitionDuration).attr("d", d3.svg.diagonal().projection(projectYX));
	}

	function hasVisibleChildren(node) {
		var expansion = getExpansion(node);
		return node.hasChildren && (expansion == "full" || (expansion != "none" && node.branches.length > 0));
	}

	function createNewNodes(visibleNodes, visibleLinks, actionNode) {
		var newNodes = visibleNodes.enter().append("svg:g").attr("id", function(node) {
			return "topologyTreeNode_" + node.id;
		}).attr("class", getNodeClass).attr("transform", function(node) {
			return translateYX(oldXY(actionNode));
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);
		newNodes.append("svg:circle").attr("r", 1e-6).on("click", toggleExpansion);
		newNodes.append("svg:text").attr("dy", ".35em").text(function(node) {
			return node.elementName;
		}).style("fill-opacity", 1e-6).on("click", redirectToElementProfilePage);
		visibleLinks.enter().insert("svg:path", "g").attr("class", "link").attr("d",
				d3.svg.diagonal().source(oldXY(actionNode)).target(oldXY(actionNode)).projection(projectYX));
	}

	function getNodeClass(node) {
		if (!node.elementId) {
			return "node node-root";
		}
		if (node.elementStatus) {
			return "node node-" + node.elementStatus;
		}
		return "node";
	}

};